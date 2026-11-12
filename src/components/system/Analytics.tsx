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
  CONSENT_OPEN_DELAY_MS,
  LEGACY_ANALYTICS_CONSENT_KEY,
  autoOpensOn,
  consentFor,
  isCurrentConsent,
  marketingConsentEnabled,
  noteConsentAsked,
  parseStoredConsent,
  readConsentAskState,
  recordCookieConsent,
  shouldAskForCookieConsent,
  writeCookieConsent,
  type ConsentAction,
} from "@/lib/cookieConsent";
import { useDialogChrome } from "@/lib/useDialogChrome";

// Cookie consent and Google Analytics, for the public pages and the booking
// widget.
//
// Nothing optional loads until the visitor says yes: no script, no cookie, no
// request. The pop-up (design 3A) opens 2 seconds after the page has fully
// loaded, or on the first scroll, whichever comes first -- never by itself
// inside a booking (autoOpensOn), and never on the signed-in trees or the back
// office, which are never recorded (isTrackablePath). Accept all and Reject
// all are the same size; "Choose what to allow" opens the switches. Every
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
      className={`relative h-[26px] w-11 flex-none rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 ${
        checked ? "bg-teal-700" : "bg-slate-300"
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

  // When it opens by itself: 2 seconds after the page has fully loaded, or on
  // the first scroll, whichever is first. Never inside a booking.
  const autoOpen = offered && askThisVisit && trackable && autoOpensOn(pathname);
  useEffect(() => {
    if (!autoOpen) return;
    let timer = 0;
    const show = () => {
      window.clearTimeout(timer);
      setOpen(true);
    };
    const arm = () => {
      timer = window.setTimeout(show, CONSENT_OPEN_DELAY_MS);
    };
    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm, { once: true });
    window.addEventListener("scroll", show, { once: true, passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("load", arm);
      window.removeEventListener("scroll", show);
    };
  }, [autoOpen]);

  // The footer's "Cookie settings" opens it on any public page, booking included.
  useEffect(() => {
    const reopen = () => {
      setLeaving(false);
      setStep(1);
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
    }, 250);
    setThanks(action === "accept_all" ? "Thanks, that really helps" : "Saved");
    window.setTimeout(() => setThanks(null), 2600);
  }

  // Escape: someone who already answered keeps their answer; someone who has
  // not is treated as "only necessary", never as a yes.
  function close() {
    if (isCurrentConsent(consent)) {
      setLeaving(true);
      window.setTimeout(() => {
        setOpen(false);
        setLeaving(false);
        setStep(1);
      }, 250);
    } else {
      choose("dismiss");
    }
  }

  const visible = open && offered && !pending;
  const { panelRef, dialogProps } = useDialogChrome({
    onClose: close,
    labelledBy: step === 1 ? "cookie-consent-title" : "cookie-consent-choose",
    active: visible && !leaving,
  });

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
        <div className="fixed inset-0 z-[60] print:hidden">
          <div
            aria-hidden="true"
            data-leaving={leaving || undefined}
            className="mr-cookie-dim absolute inset-0 bg-slate-900/45 backdrop-blur-[3px]"
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div
              ref={panelRef}
              {...dialogProps}
              data-testid="cookie-consent"
              data-leaving={leaving || undefined}
              className="mr-cookie w-full max-w-[400px] overflow-hidden rounded-[28px] bg-white px-6 pb-5 pt-7 shadow-[0_24px_60px_rgba(15,23,42,0.25)]"
            >
              {step === 1 ? (
                <div className="flex flex-col items-center gap-3.5 text-center">
                  <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
                      <path d="M9 12l2 2 4-4" />
                    </svg>
                  </span>
                  <h2 id="cookie-consent-title" className="font-display text-[22px] font-extrabold leading-tight text-slate-900">
                    Help us do better
                  </h2>
                  <p className="text-[15px] leading-normal text-slate-600">
                    Cookies help us improve the site. Your health details are never shared.
                  </p>
                  <div className="flex w-full flex-col gap-2 pt-1.5">
                    <button
                      type="button"
                      onClick={() => choose("accept_all")}
                      className="min-h-[54px] rounded-full bg-teal-700 text-[17px] font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
                    >
                      Accept all
                    </button>
                    <button
                      type="button"
                      onClick={() => choose("reject_all")}
                      className="min-h-[54px] rounded-full border-[1.5px] border-teal-700 bg-white text-[17px] font-semibold text-teal-700 transition hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
                    >
                      Reject all
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-1.5 text-[13px] text-slate-600">
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                    <span>Change it any time.</span>
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="min-h-11 rounded font-semibold text-teal-700 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                    >
                      Choose what to allow
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mr-cookie-step flex flex-col gap-3.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      aria-label="Back"
                      className="-ml-3 flex h-11 w-11 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 6l-6 6 6 6" />
                      </svg>
                    </button>
                    <h2 id="cookie-consent-choose" className="font-display text-xl font-extrabold text-slate-900">
                      Choose what to allow
                    </h2>
                  </div>
                  <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
                    <li className="flex items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="text-[15px] font-semibold text-slate-900">Necessary</p>
                        <p className="text-[13px] text-slate-600">Sign-in, security, payments</p>
                      </div>
                      <span className="text-[13px] font-semibold text-teal-700">Always on</span>
                    </li>
                    {GA_MEASUREMENT_ID && (
                      <li className="flex items-center justify-between gap-3 px-4 py-3">
                        <div>
                          <p className="text-[15px] font-semibold text-slate-900">Analytics</p>
                          <p className="text-[13px] text-slate-600">Which pages help people</p>
                        </div>
                        <Switch label="Analytics" checked={analyticsOn} onChange={setAnalyticsOn} />
                      </li>
                    )}
                    {MARKETING_ASKED && (
                      <li className="flex items-center justify-between gap-3 px-4 py-3">
                        <div>
                          <p className="text-[15px] font-semibold text-slate-900">Marketing</p>
                          <p className="text-[13px] text-slate-600">Relevant ads on other sites</p>
                        </div>
                        <Switch label="Marketing" checked={marketingOn} onChange={setMarketingOn} />
                      </li>
                    )}
                  </ul>
                  <button
                    type="button"
                    onClick={() => choose("save")}
                    className="min-h-[50px] rounded-full bg-teal-700 text-base font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
                  >
                    Save my choices
                  </button>
                  <a href="/cookies" className="mx-auto inline-flex min-h-11 items-center text-[13px] text-teal-700 underline-offset-2 hover:underline">
                    Cookie policy
                  </a>
                </div>
              )}
            </div>
          </div>
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
