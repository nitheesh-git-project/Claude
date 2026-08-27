"use client";

import { useEffect, useRef } from "react";
import {
  SPLASH_ATTR,
  SPLASH_FADE_MS,
  SPLASH_HIDDEN_AT_KEY,
  SPLASH_HOLD_MS,
  SPLASH_PHRASE,
  SPLASH_REVISIT_AWAY_MS,
  SPLASH_SHOWN_KEY,
} from "@/lib/splashScreen";

/**
 * The brand greeting that covers the site for a beat on a cold open, then
 * dissolves into whatever page was already rendered behind it.
 *
 * Two things about the shape of this are load-bearing:
 *
 * 1. **The markup never changes.** Every visual state is a value of the
 *    `data-splash` attribute on <html> (see globals.css), set by the inline
 *    boot script before first paint and moved along by the effects below.
 *    If this component decided its own visibility from React state, the
 *    server would render "hidden" and the client would hydrate "showing",
 *    which is a hydration mismatch on every single page of the app.
 * 2. **It renders inside the real page, not instead of it.** The page
 *    underneath is fully rendered the whole time, so the "transition to
 *    the application" costs nothing — there is nothing to load when the
 *    overlay lifts.
 *
 * It is `aria-hidden`: the brand name is already in the navbar underneath
 * and a screen reader gains nothing from a decorative sheet it cannot
 * dismiss.
 */
export default function SplashScreen({ siteName }: { siteName: string }) {
  // Timers for the hold and the fade. Kept in a ref so a replay (tab
  // returned to after a long absence) can cancel a sequence still in
  // flight instead of racing it — two overlapping runs would clear the
  // attribute half a second into the second greeting.
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const root = document.documentElement;

    const clearTimers = () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
    };

    // Hold, fade, then take the overlay out of the page entirely. Removing
    // the attribute (rather than leaving it at "leaving") is what returns
    // the sheet to `visibility: hidden`, so it cannot swallow a click on
    // the hero button underneath a moment after it has visually gone.
    const play = () => {
      clearTimers();
      root.setAttribute(SPLASH_ATTR, "on");
      timers.current.push(
        window.setTimeout(() => {
          root.setAttribute(SPLASH_ATTR, "leaving");
          timers.current.push(
            window.setTimeout(() => root.removeAttribute(SPLASH_ATTR), SPLASH_FADE_MS)
          );
        }, SPLASH_HOLD_MS)
      );
    };

    // Whether the boot script decided to greet this load. It, not this
    // component, owns the first decision — by the time an effect runs the
    // page has already painted.
    if (root.getAttribute(SPLASH_ATTR) === "on") {
      try {
        window.sessionStorage.setItem(SPLASH_SHOWN_KEY, "1");
      } catch {
        // Private-mode storage refusing a write only costs a repeat
        // greeting on the next reload; never worth failing a page over.
      }
      play();
    }

    // Coming back to a tab that has been sitting in the background for a
    // long while is the second "first open" the greeting is for. Reduced
    // motion opts out of this path too, for the same reason as the boot
    // script — matchMedia is read live so a preference changed mid-session
    // takes effect without a reload.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        try {
          window.sessionStorage.setItem(SPLASH_HIDDEN_AT_KEY, String(Date.now()));
        } catch {
          // Same as above: a lost timestamp just means no replay.
        }
        return;
      }

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      let hiddenAt = 0;
      try {
        hiddenAt = Number(window.sessionStorage.getItem(SPLASH_HIDDEN_AT_KEY) ?? 0);
        window.sessionStorage.removeItem(SPLASH_HIDDEN_AT_KEY);
      } catch {
        return;
      }
      if (!hiddenAt || Date.now() - hiddenAt < SPLASH_REVISIT_AWAY_MS) return;
      play();
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimers();
      // A navigation that unmounts this mid-greeting must not leave the
      // page under a permanent teal sheet.
      root.removeAttribute(SPLASH_ATTR);
    };
  }, []);

  return (
    <div className="splash-screen" aria-hidden="true">
      <div className="splash-screen__glow" />
      <div className="splash-screen__inner">
        <span className="splash-screen__mark">
          <i className="fa-solid fa-user-doctor" />
        </span>
        <span className="splash-screen__brand">{siteName}</span>
        <span className="splash-screen__phrase font-display">{SPLASH_PHRASE}</span>
        <span className="splash-screen__rule" />
      </div>
    </div>
  );
}
