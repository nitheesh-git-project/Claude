"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import {
  GA_MEASUREMENT_ID,
  cleanPageLocation,
  isTrackablePath,
  COOKIE_SETTINGS_EVENT,
  COOKIE_SETTINGS_HASH,
  withdrawGoogle,
  track,
} from "@/lib/analytics";
import {
  COOKIE_CONSENT_EVENT,
  COOKIE_CONSENT_KEY,
  LEGACY_ANALYTICS_CONSENT_KEY,
  cardShownOn,
  consentFor,
  isCurrentConsent,
  marketingConsentEnabled,
  noteConsentAsked,
  parseStoredConsent,
  readConsentAskState,
  recordCookieConsent,
  shouldAskForCookieConsent,
  shouldAutoOpenCard,
  writeCookieConsent,
  type ConsentAction,
} from "@/lib/cookieConsent";

// Cookie consent and Google Analytics, for the public pages and the booking
// widget.
//
// Nothing optional loads until the visitor says yes: no script, no cookie, no
// request. The cookie card (the dark "bottom card" design) slides up at the
// bottom of the screen as soon as the opening splash has lifted -- never by
// itself inside a booking (autoOpensOn), and never on the signed-in trees or
// the back office, which are never recorded (isTrackablePath). It does not
// block the page. Customise, Reject and Accept are the same size; Accept is
// the bright one. Customise shows the switches and turns into Save. Every
// choice is kept in this browser and recorded on the server (/api/consent),
// which is what Settings -> Cookie consent counts.
//
// Clicks are read from the DOM by one delegated listener instead of an
// attribute on every button, so a new button is covered the day it is
// written. What it reads is only the link's destination, the area of the
// page it sits in, and a short label.

function areaOf(el: Element): string {
  if (el.closest("[data-tabbar]")) return "sticky_bar";
  if (el.closest("footer")) return "footer";
  if (el.closest("header, nav")) return "navbar";
  const section = el.closest("section[id]");
  return section?.id ? section.id : "page";
}

function channelOf(href: string): string | null {
  if (href.startsWith("tel:")) return "phone";
  if (href.startsWith("mailto:")) return "email";
  if (/^https?:\/\/(wa\.me|api\.whatsapp\.com)\//.test(href)) return "whatsapp";
  return null;
}

function isBookingLink(href: string): boolean {
  return /^\/(book|book-home-visit|get-started)(\/|\?|#|$)/.test(href);
}

function subscribeConsent(notify: () => void) {
  window.addEventListener(COOKIE_CONSENT_EVENT, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(COOKIE_CONSENT_EVENT, notify);
    window.removeEventListener("storage", notify);
  };
}

/** The raw stored strings, so the snapshot is stable between renders. */
function snapshotConsent(): string {
  try {
    return `${window.localStorage.getItem(COOKIE_CONSENT_KEY) ?? ""}\u0000${
      window.localStorage.getItem(LEGACY_ANALYTICS_CONSENT_KEY) ?? ""
    }`;
  } catch {
    return "\u0000";
  }
}

const MARKETING_ASKED = marketingConsentEnabled();

const SECONDARY_BUTTON =
  "min-h-12 rounded-[14px] border-[1.5px] border-white/45 bg-transparent text-[15px] font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b3b37]";

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[26px] w-11 flex-none rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b3b37] ${
        checked ? "bg-teal-500" : "bg-white/25"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-[left] ${checked ? "left-[21px]" : "left-[3px]"}`}
      />
    </button>
  );
}

export default function Analytics() {
  const pathname = usePathname();
  const raw = useSyncExternalStore(subscribeConsent, snapshotConsent, () => "pending");
  const pending = raw === "pending";
  const [rawConsent, rawLegacy] = pending ? ["", ""] : raw.split("\u0000");
  const consent = pending ? null : parseStoredConsent(rawConsent || null, rawLegacy || null);
  const granted = !!consent?.analytics;

  const [loaded, setLoaded] = useState(false);
  // Off the moment consent is withdrawn, without waiting for a reload.
  const ready = loaded && granted;
  const trackable = isTrackablePath(pathname);
  const offered = !!GA_MEASUREMENT_ID || MARKETING_ASKED;

  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [analyticsOn, setAnalyticsOn] = useState(false);
  const [marketingOn, setMarketingOn] = useState(false);
  const [thanks, setThanks] = useState<string | null>(null);
  // Opened with the footer's Cookie settings rather than by itself.
  const [openedByVisitor, setOpenedByVisitor] = useState(false);
  // Whether this visit asks at all: read once on the client, after
  // hydration, so the server's render and the first client render agree.
  const [askThisVisit, setAskThisVisit] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAskThisVisit(
      shouldAskForCookieConsent({
        consent: parseStoredConsent(
          (() => {
            try {
              return window.localStorage.getItem(COOKIE_CONSENT_KEY);
            } catch {
              return null;
            }
          })(),
          (() => {
            try {
              return window.localStorage.getItem(LEGACY_ANALYTICS_CONSENT_KEY);
            } catch {
              return null;
            }
          })()
        ),
        ...readConsentAskState(),
        nowMs: Date.now(),
      })
    );
  }, []);

  // The init snippet runs after hydration; wait for gtag to exist.
  useEffect(() => {
    if (!granted) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (window.gtag) {
        setLoaded(true);
        window.clearInterval(timer);
      } else if (tries > 100) {
        window.clearInterval(timer);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [granted]);

  // One page_view per route change, with the query string left off.
  useEffect(() => {
    if (!ready || !trackable || !pathname || !window.gtag) return;
    window.gtag("event", "page_view", {
      page_location: cleanPageLocation(window.location.origin, pathname),
      page_path: pathname,
      page_title: document.title,
    });
  }, [ready, trackable, pathname]);

  // Link clicks: booking calls to action and the three ways to reach the clinic.
  useEffect(() => {
    if (!ready) return;
    function onClick(e: MouseEvent) {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      const channel = channelOf(href);
      if (channel) {
        track("contact_click", { channel, location: areaOf(a) });
      } else if (isBookingLink(href)) {
        track("cta_click", { location: areaOf(a), label: (a.textContent ?? "").slice(0, 40) });
      }
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [ready]);

  // Which sections people actually reach, once each per page view.
  useEffect(() => {
    if (!ready || !trackable || typeof IntersectionObserver === "undefined") return;
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = entry.target.id;
          if (!id || seen.has(id)) continue;
          seen.add(id);
          io.unobserve(entry.target);
          track("section_view", { section: id });
        }
      },
      { threshold: 0.4 }
    );
    document.querySelectorAll("main section[id]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ready, trackable, pathname]);

  // When it opens by itself: as soon as the opening splash has lifted (on a
  // page with no splash, straight after hydration). Never inside a booking.
  // Decided from the visitor's *current* answer on every route change: see
  // shouldAutoOpenCard for why a value read once at load is not enough.
  const autoOpen = shouldAutoOpenCard({ offered, askThisVisit, consent, trackable, pathname });
  useEffect(() => {
    if (!autoOpen) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      // The splash is on screen while <html> carries data-splash; 60 tries
      // (6 s) is a ceiling so a stuck attribute never hides the choice.
      if (!document.documentElement.hasAttribute("data-splash") || tries > 60) {
        window.clearInterval(timer);
        setOpen(true);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [autoOpen]);

  // While the card is up, <html> carries data-cookie-card so the front
  // page's floating scroll arrow (ScrollHint), which sits in the same
  // bottom-right corner, steps aside instead of hiding under the card.
  useEffect(() => {
    const root = document.documentElement;
    if (open) root.setAttribute("data-cookie-card", "");
    else root.removeAttribute("data-cookie-card");
    return () => root.removeAttribute("data-cookie-card");
  }, [open]);

  // The footer's "Cookie settings" opens it on any public page, booking included.
  useEffect(() => {
    const reopen = () => {
      setLeaving(false);
      setStep(1);
      setOpenedByVisitor(true);
      setOpen(true);
    };
    // A tap that landed before hydration left the hash instead of the event.
    const fromHash = () => {
      if (window.location.hash !== COOKIE_SETTINGS_HASH) return;
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      reopen();
    };
    fromHash();
    window.addEventListener(COOKIE_SETTINGS_EVENT, reopen);
    window.addEventListener("hashchange", fromHash);
    return () => {
      window.removeEventListener(COOKIE_SETTINGS_EVENT, reopen);
      window.removeEventListener("hashchange", fromHash);
    };
  }, []);

  // Opening shows the switches as they were last saved.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnalyticsOn(!!consent?.analytics);
    setMarketingOn(!!consent?.marketing);
    // Only on opening; the switches are the visitor's from then on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Withdrawn consent stops collection at once and clears Google's cookies.
  useEffect(() => {
    if (pending) return;
    withdrawGoogle(!granted);
  }, [pending, granted]);

  // In front of someone who has not answered: rest it in every other tab.
  const undecided = !isCurrentConsent(consent);
  useEffect(() => {
    if (open && undecided) noteConsentAsked(Date.now());
  }, [open, undecided]);

  function choose(action: ConsentAction) {
    const next = consentFor(
      action,
      { analytics: analyticsOn, marketing: marketingOn },
      MARKETING_ASKED,
      Date.now()
    );
    writeCookieConsent(next);
    recordCookieConsent(action, next, pathname ?? "/");
    setLeaving(true);
    window.setTimeout(() => {
      setOpen(false);
      setLeaving(false);
      setStep(1);
      setOpenedByVisitor(false);
    }, 250);
    setThanks(action === "accept_all" ? "Thanks, that really helps" : "Saved");
    window.setTimeout(() => setThanks(null), 2600);
  }

  const visible = !pending && cardShownOn({ open, offered, trackable, pathname, openedByVisitor });

  if (pending) return null;

  return (
    <>
      {granted && GA_MEASUREMENT_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            window.gtag = function () { window.dataLayer.push(arguments); };
            window.gtag('js', new Date());
            window.gtag('config', ${JSON.stringify(GA_MEASUREMENT_ID)}, {
              send_page_view: false,
              allow_google_signals: false,
              allow_ad_personalization_signals: false
            });
          `}</Script>
        </>
      )}
      {visible && (
        // A card at the bottom, not a dialog: the page stays readable and
        // usable behind it, nothing is dimmed or locked, and focus is not
        // trapped. Accept is the bright one; Reject and Customise are the
        // same size beside it, so saying no is exactly as easy.
        <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] flex justify-center sm:inset-x-auto sm:bottom-6 sm:right-6 sm:justify-end print:hidden">
          <section
            role="region"
            aria-labelledby="cookie-consent-title"
            data-testid="cookie-consent"
            data-notebook-avoid=""
            data-leaving={leaving || undefined}
            className="mr-cookie pointer-events-auto flex w-full max-w-[440px] flex-col gap-3.5 rounded-3xl bg-[#0b3b37] px-5 pb-5 pt-[22px] text-white shadow-[0_24px_60px_rgba(15,23,42,0.35)]"
          >
            <h2 id="cookie-consent-title" className="font-display text-[22px] font-extrabold leading-tight">
              Cookie settings
            </h2>
            <p className="text-[15px] leading-relaxed text-[#cfe9e5]">
              We use cookies to run the site and, if you agree, to improve it. Your health details are
              never shared. Read our{" "}
              <a href="/cookies" className="text-white underline underline-offset-2 hover:text-teal-100">
                Cookie policy
              </a>
              .
            </p>
            {step === 2 && (
              <ul className="mr-cookie-step divide-y divide-white/10 rounded-2xl bg-white/[0.08]">
                <li className="flex items-center justify-between gap-3 px-3.5 py-3">
                  <div>
                    <p className="text-[15px] font-semibold">Necessary</p>
                    <p className="text-[13px] text-[#cfe9e5]">Sign-in, security, payments</p>
                  </div>
                  <span className="text-[13px] font-semibold text-[#5eead4]">Always on</span>
                </li>
                {GA_MEASUREMENT_ID && (
                  <li className="flex items-center justify-between gap-3 px-3.5 py-3">
                    <div>
                      <p className="text-[15px] font-semibold">Analytics</p>
                      <p className="text-[13px] text-[#cfe9e5]">Which pages help people</p>
                    </div>
                    <Switch label="Analytics" checked={analyticsOn} onChange={setAnalyticsOn} />
                  </li>
                )}
                {MARKETING_ASKED && (
                  <li className="flex items-center justify-between gap-3 px-3.5 py-3">
                    <div>
                      <p className="text-[15px] font-semibold">Marketing</p>
                      <p className="text-[13px] text-[#cfe9e5]">Relevant ads on other sites</p>
                    </div>
                    <Switch label="Marketing" checked={marketingOn} onChange={setMarketingOn} />
                  </li>
                )}
              </ul>
            )}
            <div className="grid grid-cols-3 gap-2">
              {step === 1 ? (
                <button type="button" onClick={() => setStep(2)} className={SECONDARY_BUTTON}>
                  Customise
                </button>
              ) : null}
              <button type="button" onClick={() => choose("reject_all")} className={SECONDARY_BUTTON}>
                Reject
              </button>
              {step === 2 ? (
                <button type="button" onClick={() => choose("save")} className={SECONDARY_BUTTON}>
                  Save
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => choose("accept_all")}
                className="min-h-12 rounded-[14px] bg-[#5eead4] text-[15px] font-bold text-[#042f2e] shadow-[0_6px_18px_rgba(0,0,0,0.25)] transition hover:bg-[#99f6e4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b3b37]"
              >
                Accept
              </button>
            </div>
          </section>
        </div>
      )}
      {thanks && (
        <div
          role="status"
          className="mr-consent-toast pointer-events-none fixed bottom-28 left-1/2 z-[60] flex items-center gap-2 whitespace-nowrap rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg sm:bottom-6"
        >
          <i aria-hidden="true" className="fa-solid fa-check text-teal-300" />
          {thanks}
        </div>
      )}
    </>
  );
}
