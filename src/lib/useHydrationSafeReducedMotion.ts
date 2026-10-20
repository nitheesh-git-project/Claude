"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const media = typeof window !== "undefined" && window.matchMedia ? window.matchMedia(QUERY) : null;
  if (!media) return () => {};
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return typeof window !== "undefined" && window.matchMedia ? window.matchMedia(QUERY).matches : false;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Whether the visitor asked for reduced motion -- `false` on the server and
 * on the hydrating render, the real answer straight after.
 *
 * motion's own `useReducedMotion` reads matchMedia synchronously on the
 * client's first render. The server has no media query and says null, so for
 * anybody with reduced motion switched on, a component that renders
 * *differently* on it (the health-profile showcase's pause button, which
 * only exists while the tour rotates) hydrated against markup it did not
 * produce -- React error #418 on the home page. useSyncExternalStore renders
 * the server snapshot during hydration and then the client's, so the first
 * client render always matches the HTML.
 */
export function useHydrationSafeReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
