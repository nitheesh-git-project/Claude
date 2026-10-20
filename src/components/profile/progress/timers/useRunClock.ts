"use client";

import { useEffect, useRef, useState } from "react";
import { clockDisagreement } from "@/lib/testTimers";

/** The face is redrawn about ten times a second: tenths of a second are
 *  the finest a stopwatch reading is kept to. */
const REDRAW_MS = 100;

/**
 * The monotonic "now" for a timed test, and whether the timing can be
 * trusted.
 *
 * `now` is performance.now(), which never goes backwards and does not move
 * when the person changes the device's clock. It is only a timestamp to
 * subtract from the one taken at Start (see src/lib/testTimers.ts): nothing
 * here counts ticks, so a throttled or paused requestAnimationFrame in a
 * background tab cannot lose time - the next frame (or the visibility change
 * below) simply reads the clock again.
 *
 * `interrupted` turns true for the rest of a run if the page was hidden while
 * it ran, or if the wall clock and the monotonic clock disagree by more than
 * two seconds (a device that slept). The screen then says the timing should be
 * checked rather than recording it silently. It resets when a new run starts.
 *
 * While `running` is false nothing is scheduled.
 */
export function useRunClock(running: boolean): { now: number; interrupted: boolean } {
  const [now, setNow] = useState(0);
  const [interrupted, setInterrupted] = useState(false);
  const origin = useRef<{ perf: number; wall: number } | null>(null);

  useEffect(() => {
    if (!running) {
      origin.current = null;
      return;
    }
    const perf0 = performance.now();
    origin.current = { perf: perf0, wall: Date.now() };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new run starts with a clean flag and a fresh reading
    setInterrupted(false);
    setNow(perf0);

    let frame = 0;
    let lastDraw = perf0;
    const check = () => {
      const o = origin.current;
      if (!o) return;
      const perf = performance.now();
      if (clockDisagreement(perf - o.perf, Date.now() - o.wall)) setInterrupted(true);
      setNow(perf);
    };
    const loop = () => {
      const perf = performance.now();
      if (perf - lastDraw >= REDRAW_MS) {
        lastDraw = perf;
        check();
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") setInterrupted(true);
      else check();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [running]);

  return { now, interrupted };
}

/** A fresh reading, for the instant a button is pressed. */
export function readClock(): number {
  return performance.now();
}
