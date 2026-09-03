"use client";

import { useEffect, useState } from "react";
import { usePendingWork } from "@/lib/pendingWork";

/**
 * The one thing on screen that says "the app heard you and is working".
 *
 * A thin teal bar across the very top of the viewport, above every piece of
 * chrome. It exists because the slowest moment in this app is invisible: a
 * button's own `loading` flag covers the fetch, and then `router.refresh()`
 * re-renders a Server Component the button knows nothing about. Between those
 * two the page simply stops answering, which people read as a freeze rather
 * than as work.
 *
 * Three decisions are load-bearing:
 *
 * 1. **It never shows a percentage.** Nothing here knows how far along a
 *    server render is, and a bar that crawls to 90% and waits is a lie people
 *    learn to distrust. It eases toward a ceiling it never reaches and then
 *    completes in one movement when the work actually lands.
 *
 * 2. **It waits before appearing.** Most actions finish in well under a
 *    quarter of a second, and a bar that flashes on every tap is visual noise
 *    that makes a fast app feel busy. Below the delay nothing is drawn at all.
 *
 * 3. **Reduced motion is honoured** by dropping the travel and the shimmer
 *    rather than the bar: someone who has asked for less movement still needs
 *    to know the app is thinking, so they get a static teal band that fades.
 */

/** Under this, a person reads the action as instant and the bar as a flicker. */
const APPEAR_AFTER_MS = 220;
/** How long the finished bar stays at full width before fading out. */
const COMPLETE_HOLD_MS = 240;

export default function RouteProgress() {
  const { pending } = usePendingWork();
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");

  // Adjust-state-while-rendering rather than an effect (the pattern Navbar's
  // navigating reset uses): work stopping is a prop change, and reacting to
  // it in an effect would paint one frame of a bar that is already finished.
  const [wasPending, setWasPending] = useState(pending);
  if (pending !== wasPending) {
    setWasPending(pending);
    // Only complete a bar that was actually drawn. Work that finished inside
    // the appear delay leaves nothing behind to fade out.
    if (!pending && phase === "running") setPhase("done");
  }

  useEffect(() => {
    if (!pending || phase !== "idle") return;
    const timer = setTimeout(() => setPhase("running"), APPEAR_AFTER_MS);
    return () => clearTimeout(timer);
  }, [pending, phase]);

  useEffect(() => {
    if (phase !== "done") return;
    const timer = setTimeout(() => setPhase("idle"), COMPLETE_HOLD_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === "idle") return null;

  return (
    <div
      // aria-hidden with a separate live region below: the bar itself is
      // decoration, and announcing a moving graphic on every tap is noise.
      // What a screen reader needs is the one word, once.
      className="route-progress"
      data-state={phase}
    >
      <div className="route-progress__bar" aria-hidden="true" />
      <span className="sr-only" role="status" aria-live="polite">
        {phase === "running" ? "Working…" : "Done"}
      </span>
    </div>
  );
}
