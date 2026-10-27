"use client";

import { useEffect, useRef } from "react";
import {
  SPLASH_ATTR,
  SPLASH_FADE_VAR,
  SPLASH_HIDDEN_AT_KEY,
  SPLASH_HOLD_VAR,
  SPLASH_SHOWN_KEY,
  splashSkipsPath,
  splashTimings,
  type SplashConfig,
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
 *    the application" costs nothing - there is nothing to load when the
 *    overlay lifts.
 *
 * It is `aria-hidden`: the brand name is already in the navbar underneath
 * and a screen reader gains nothing from a decorative sheet it cannot
 * dismiss.
 */
export default function SplashScreen({ config }: { config: SplashConfig }) {
  // The admin's values, held in a ref so the effect below can subscribe
  // once and stay mounted for the life of the tab. Reading them from props
  // in that effect's dependencies instead would re-run it - and its
  // cleanup clears the attribute, so a settings change landing mid-greeting
  // would blank the sheet halfway through. Kept in step by its own effect
  // rather than assigned during render, which React forbids.
  const settings = useRef(config);
  useEffect(() => {
    settings.current = config;
  }, [config]);

  // Timers for the hold and the fade. Kept in a ref so a replay (tab
  // returned to after a long absence) can cancel a sequence still in
  // flight instead of racing it - two overlapping runs would clear the
  // attribute half a second into the second greeting.
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const root = document.documentElement;

    const clearTimers = () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
    };

    // The hold and the fade are the stylesheet's animation (globals.css),
    // started the instant the boot script set the attribute and timed by two
    // custom properties on <html> -- nothing here waits on hydration for the
    // sheet to leave. All this does is clear the attribute once the animation
    // has certainly finished, which is what returns the sheet to
    // `visibility: hidden` for good and lets a later replay restart the
    // animation (it only restarts when the selector stops matching first).
    const timingsNow = () => splashTimings(settings.current.holdMs, window.location.pathname);

    const play = () => {
      clearTimers();
      const { holdMs, fadeMs } = timingsNow();
      // Restart from nothing: a sheet already on "on" would not replay.
      root.removeAttribute(SPLASH_ATTR);
      void root.offsetWidth;
      root.style.setProperty(SPLASH_HOLD_VAR, `${holdMs}ms`);
      root.style.setProperty(SPLASH_FADE_VAR, `${fadeMs}ms`);
      root.setAttribute(SPLASH_ATTR, "on");
      timers.current.push(
        window.setTimeout(() => root.removeAttribute(SPLASH_ATTR), holdMs + fadeMs + 80)
      );
    };

    // The boot script owns the first decision and has already started the
    // animation; this only schedules the clean-up, from the timings it used.
    const clearAfterBoot = () => {
      clearTimers();
      const { holdMs, fadeMs } = timingsNow();
      timers.current.push(
        window.setTimeout(() => root.removeAttribute(SPLASH_ATTR), holdMs + fadeMs + 80)
      );
    };

    // Whether the boot script decided to greet this load. It, not this
    // component, owns the first decision - by the time an effect runs the
    // page has already painted.
    if (root.getAttribute(SPLASH_ATTR) === "on") {
      try {
        window.sessionStorage.setItem(SPLASH_SHOWN_KEY, "1");
      } catch {
        // Private-mode storage refusing a write only costs a repeat
        // greeting on the next reload; never worth failing a page over.
      }
      clearAfterBoot();
    }

    // Coming back to a tab that has been sitting in the background for a
    // long while is the second "first open" the greeting is for. Reduced
    // motion opts out of this path too, for the same reason as the boot
    // script - matchMedia is read live so a preference changed mid-session
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
      if (splashSkipsPath(window.location.pathname)) return;

      // 0 is the admin saying "greet the first load only" - no amount of
      // time away earns a replay then.
      const awayMs = settings.current.revisitAwayMs;
      let hiddenAt = 0;
      try {
        hiddenAt = Number(window.sessionStorage.getItem(SPLASH_HIDDEN_AT_KEY) ?? 0);
        window.sessionStorage.removeItem(SPLASH_HIDDEN_AT_KEY);
      } catch {
        return;
      }
      if (awayMs <= 0 || !hiddenAt || Date.now() - hiddenAt < awayMs) return;
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
        <span className="splash-screen__brand">{config.brandLine}</span>
        <span className="splash-screen__phrase font-display">{config.phrase}</span>
        <span className="splash-screen__rule" />
      </div>
    </div>
  );
}
