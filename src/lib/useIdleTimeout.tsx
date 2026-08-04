"use client";

import { useEffect, useRef } from "react";

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;

// Signs the user out after `timeoutMinutes` of no mouse/keyboard/touch/
// scroll activity anywhere on the page -- see Feature 16's admin-configured
// Session Timeout of Inactivity. `timeoutMinutes <= 0` disables it entirely
// (the default), so every dashboard can call this unconditionally with
// whatever value it read from admin_settings without a separate on/off
// prop. `onTimeout` is expected to sign out and hard-navigate, matching
// this codebase's existing sign-out handlers.
export function useIdleTimeout(timeoutMinutes: number, onTimeout: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    if (!timeoutMinutes || timeoutMinutes <= 0) return;
    const timeoutMs = timeoutMinutes * 60 * 1000;

    function reset() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onTimeoutRef.current(), timeoutMs);
    }

    reset();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, reset, { passive: true }));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [timeoutMinutes]);
}
