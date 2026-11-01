"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import {
  GA_MEASUREMENT_ID,
  cleanPageLocation,
  isTrackablePath,
  readConsent,
  ANALYTICS_REOPEN_EVENT,
  withdrawGoogle,
  track,
  writeConsent,
  type AnalyticsConsent,
} from "@/lib/analytics";

// Google Analytics for the public pages and the booking widget.
//
// Nothing loads until the visitor accepts: no script, no cookie, no request.
// A visitor who declines is asked once and never again. The signed-in trees
// and the back office are never recorded (see isTrackablePath), and the
// banner does not appear on them either.
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

const CONSENT_EVENT = "mr-analytics-consent";

function subscribeConsent(notify: () => void) {
  window.addEventListener(CONSENT_EVENT, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(CONSENT_EVENT, notify);
    window.removeEventListener("storage", notify);
  };
}

function snapshotConsent(): AnalyticsConsent | "none" {
  return readConsent() ?? "none";
}

export default function Analytics() {
  const pathname = usePathname();
  const stored: AnalyticsConsent | "none" | "pending" = useSyncExternalStore(
    subscribeConsent,
    snapshotConsent,
    () => "pending"
  );
  const consent = stored === "none" ? null : stored;
  const [loaded, setLoaded] = useState(false);
  // Off the moment consent is withdrawn, without waiting for a reload.
  const ready = loaded && consent === "granted";
  const [reopened, setReopened] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [thanks, setThanks] = useState<string | null>(null);
  const [splashGone, setSplashGone] = useState(false);

  // The init snippet runs after hydration; wait for gtag to exist.
  useEffect(() => {
    if (consent !== "granted") return;
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
  }, [consent]);

  const trackable = isTrackablePath(pathname);

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

  // The card waits for the opening greeting to lift, so it arrives as part of
  // the welcome rather than on top of it.
  useEffect(() => {
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (!document.documentElement.hasAttribute("data-splash") || tries > 60) {
        setSplashGone(true);
        window.clearInterval(timer);
      }
    }, 150);
    return () => window.clearInterval(timer);
  }, []);

  // The footer's "Analytics settings" link asks for the card again.
  useEffect(() => {
    const open = () => {
      setLeaving(false);
      setReopened(true);
    };
    window.addEventListener(ANALYTICS_REOPEN_EVENT, open);
    return () => window.removeEventListener(ANALYTICS_REOPEN_EVENT, open);
  }, []);

  // Withdrawn consent stops collection at once and clears Google's cookies.
  useEffect(() => {
    if (consent === "pending") return;
    withdrawGoogle(consent !== "granted");
  }, [consent]);

  if (!GA_MEASUREMENT_ID || consent === "pending") return null;

  const cardOpen = (consent === null || reopened) && trackable && splashGone;

  function choose(value: AnalyticsConsent) {
    writeConsent(value);
    window.dispatchEvent(new Event(CONSENT_EVENT));
    // A yes gets a beat for the heart before the card slides away.
    const wait = value === "granted" ? 550 : 0;
    setCelebrating(value === "granted");
    window.setTimeout(() => {
      setLeaving(true);
      window.setTimeout(() => {
        setReopened(false);
        setLeaving(false);
        setCelebrating(false);
      }, 400);
    }, wait);
    setThanks(value === "granted" ? "Thanks, that really helps" : "No problem, saved");
    window.setTimeout(() => setThanks(null), 2600 + wait);
  }

  return (
    <>
      {consent === "granted" && (
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
      {cardOpen && (
        <>
          {/* A soft dim on phones so the card is noticed. It never blocks a tap:
              consent has to be a free choice, so nothing is locked behind it. */}
          <div aria-hidden="true" className="mr-consent-dim pointer-events-none fixed inset-0 z-40 bg-slate-900/40 sm:hidden" data-leaving={leaving || undefined} />
          <div
            role="region"
            aria-label="Analytics"
            data-leaving={leaving || undefined}
            className="mr-consent fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border-t border-slate-200 bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-20px_50px_-20px_rgba(8,40,40,0.45)] sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:w-[30rem] sm:max-w-[calc(100%-2rem)] sm:rounded-3xl sm:border sm:px-6 sm:pb-5 sm:pt-5 print:hidden"
          >
            <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
            <div className="flex items-end gap-3">
              <span className="mr-consent-face relative flex h-14 w-14 flex-none items-center justify-center rounded-full bg-gradient-to-br from-teal-200 to-teal-500 text-white">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
                </svg>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="mr-consent-heart pointer-events-none absolute left-1/2 top-[40%] -ml-3.5 h-7 w-7 text-rose-400 opacity-0" fill="currentColor" data-on={celebrating || undefined}>
                  <path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z" />
                </svg>
              </span>
              <div className="mr-consent-bubble rounded-[1.1rem] rounded-bl-sm bg-teal-50 px-3.5 py-3 text-sm leading-snug text-teal-950">
                <h2 className="inline font-bold">Hi, welcome.</h2>{" "}
                Can we take a quiet look at which pages help? It never includes your name,
                contact or health details.
              </div>
            </div>
            <button
              type="button"
              onClick={() => choose("granted")}
              className="mr-consent-yes mt-4 flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-teal-700 text-base font-bold text-white shadow-[0_10px_24px_-10px_rgba(15,118,110,0.8)] transition hover:-translate-y-px hover:bg-teal-800 active:scale-[0.985]"
            >
              Yes, happy to help
              <i aria-hidden="true" className="fa-solid fa-arrow-right text-sm" />
            </button>
            <button
              type="button"
              onClick={() => choose("denied")}
              className="mx-auto mt-1 block min-h-11 rounded-lg px-4 text-sm font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 transition hover:text-teal-800 hover:decoration-teal-700"
            >
              Not now
            </button>
            <p className="text-center text-xs text-slate-500">
              Change your mind anytime from the footer.
            </p>
          </div>
        </>
      )}
      {thanks && (
        <div
          role="status"
          className="mr-consent-toast pointer-events-none fixed bottom-28 left-1/2 z-50 flex items-center gap-2 whitespace-nowrap rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg sm:bottom-6"
        >
          <i aria-hidden="true" className="fa-solid fa-check text-teal-300" />
          {thanks}
        </div>
      )}
    </>
  );
}
