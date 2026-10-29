"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import {
  GA_MEASUREMENT_ID,
  cleanPageLocation,
  isTrackablePath,
  readConsent,
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
  const [ready, setReady] = useState(false);

  // The init snippet runs after hydration; wait for gtag to exist.
  useEffect(() => {
    if (consent !== "granted") return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (window.gtag) {
        setReady(true);
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

  if (!GA_MEASUREMENT_ID || consent === "pending") return null;

  function choose(value: AnalyticsConsent) {
    writeConsent(value);
    window.dispatchEvent(new Event(CONSENT_EVENT));
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
      {consent === null && trackable && (
        <div
          role="region"
          aria-label="Analytics"
          className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-4 shadow-lg lg:bottom-4 print:hidden"
        >
          <p className="text-sm text-slate-700">
            We use Google Analytics to see which pages help visitors and where booking gets
            stuck. It never records your name, contact details or anything about your health.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => choose("denied")}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              No thanks
            </button>
            <button
              type="button"
              onClick={() => choose("granted")}
              className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800"
            >
              Allow
            </button>
          </div>
        </div>
      )}
    </>
  );
}
