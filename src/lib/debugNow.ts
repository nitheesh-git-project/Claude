"use client";

// QA debug tool (Feature 44): lets an admin simulate the site's current
// date/time so time-gated features (booking lead time, "Tap to Join"
// windows, etc.) can be tested without waiting for real time to pass.
// Stored as an OFFSET (not an absolute target) so the simulated clock keeps
// ticking forward at normal speed after being set, rather than freezing --
// e.g. "12 hours from now" stays 12 hours ahead of real time as minutes
// pass, matching how a real clock would behave.
//
// Client-only and additive: every call site that reads debugNow() instead
// of Date.now() falls back to the real clock when no override is set, so
// this has zero effect on production once the debug bar itself is hidden
// (see NEXT_PUBLIC_SHOW_DEBUG_NAV). Deliberately never wired into any
// server-side/API-route time check (refund eligibility, payout math, etc.)
// -- those must stay grounded in the server's real clock; only client-
// rendered advisory gates read this.
const STORAGE_KEY = "debugNowOffsetMs";

export function getDebugNowOffsetMs(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function setDebugNowOffsetMs(offsetMs: number | null) {
  if (typeof window === "undefined") return;
  if (!offsetMs) {
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    window.localStorage.setItem(STORAGE_KEY, String(offsetMs));
  }
}

// Drop-in replacement for Date.now() at any client-side call site that
// should respect the simulated clock.
export function debugNow(): number {
  return Date.now() + getDebugNowOffsetMs();
}
