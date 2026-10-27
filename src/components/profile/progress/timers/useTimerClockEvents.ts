"use client";

import { useCallback, useEffect, useRef } from "react";
import { clockEventFor, type TimerClockEvent } from "@/lib/timerClock";

/**
 * Tells the session cockpit (when this timer is inside a guided step) that a
 * run started, finished or was thrown away. Start and finish follow the
 * `running` flag; call the returned `abort()` just before discarding a run.
 * Unmounting says nothing: the cockpit clears the patient's clock itself.
 */
export function useTimerClockEvents(running: boolean, onClock?: (event: TimerClockEvent) => void): () => void {
  const was = useRef(false);
  const aborted = useRef(false);
  const latest = useRef(onClock);
  useEffect(() => {
    latest.current = onClock;
  });
  useEffect(() => {
    const event = clockEventFor(was.current, running, aborted.current);
    if (!running) aborted.current = false;
    was.current = running;
    if (event) latest.current?.(event);
  }, [running]);
  return useCallback(() => {
    if (!was.current) return;
    aborted.current = true;
    latest.current?.("abort");
  }, []);
}
