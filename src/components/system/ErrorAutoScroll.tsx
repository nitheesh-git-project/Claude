"use client";

import { useEffect } from "react";

// A form error that appears off-screen is an error nobody sees.
//
// Every form in the app reports a failed rule or a failed request in a red
// banner. On a long form, or on a phone, that banner can sit above the part of
// the page the person is looking at, so the tap on Continue or Save appears to
// do nothing. This is one observer at the root rather than a change to a
// hundred and sixty banners, in the same spirit as FormValidationChrome: any
// banner in the app's error style that appears (or whose text changes) *in
// answer to something the person just did* is brought into view.
//
// Two guards keep it from being a nuisance:
// - It only acts within ~1.5s of a tap, key press or submit. A banner that
//   renders on page load, or from a background refresh, never moves the page.
// - It only scrolls when the banner is actually outside the viewport. One the
//   person can already see is left alone.
//
// A screen that wants to take someone to the *field* (better still) calls
// `revealField`; this is the safety net for every screen that has not.
// `data-no-autoscroll` on an element opts it, and everything inside, out.

const BANNER_SELECTOR = "[data-form-error], .bg-red-50.border-red-200, .border-red-200.bg-red-50";
const ACTION_WINDOW_MS = 1500;

export default function ErrorAutoScroll() {
  useEffect(() => {
    let lastActionAt = 0;
    const mark = () => {
      lastActionAt = Date.now();
    };
    const events = ["pointerdown", "keydown", "submit"] as const;
    for (const e of events) document.addEventListener(e, mark, true);

    function maybeReveal(node: Node) {
      const el = node instanceof HTMLElement ? node : node.parentElement;
      if (!el) return;
      const banner = el.closest<HTMLElement>(BANNER_SELECTOR) ?? el.querySelector<HTMLElement>(BANNER_SELECTOR);
      if (!banner || banner.closest("[data-no-autoscroll]")) return;
      if (!banner.textContent?.trim()) return;
      if (Date.now() - lastActionAt > ACTION_WINDOW_MS) return;
      const r = banner.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      const margin = 72; // clear the sticky nav
      if (r.top >= margin && r.bottom <= window.innerHeight) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      banner.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    }

    const observer = new MutationObserver((records) => {
      for (const rec of records) {
        if (rec.type === "childList") rec.addedNodes.forEach(maybeReveal);
        else if (rec.type === "characterData") maybeReveal(rec.target);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      for (const e of events) document.removeEventListener(e, mark, true);
    };
  }, []);

  return null;
}
