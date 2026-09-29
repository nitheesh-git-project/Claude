"use client";

import { isCoveredByRefresh } from "@/lib/refreshCoverage";

/**
 * When this browser last deliberately re-fetched the page.
 *
 * `RealtimeRefresh` turns a Postgres change into `router.refresh()`, and on
 * the admin dashboard that is the whole Server Component again -- ~41
 * queries, every screen. Most of those events are the browser's own work
 * coming back to it: an admin taps a control, the route writes its row *and*
 * an `admin_activity_log` entry, and the control has already called
 * `router.refresh()` itself. The two events then arrived as two more
 * rebuilds, the second of them up to the catalog channel's 30s cooldown
 * later -- long enough that the admin had forgotten the tap and read it as
 * the page reloading on its own.
 *
 * A change is redundant when this browser's own refresh has already read the
 * row. Comparing timestamps rather than tagging events is what makes it work
 * across both realtime channels and across every control in the app, none of
 * which knows which rows its route touched.
 *
 * **A refresh is a window, not an instant, and that was the bug.** The test
 * used to be "did a refresh start after this event arrived", which for the
 * browser's own work can never be true: the route commits, the response comes
 * back, the control refreshes, and *then* the event arrives. So the window was
 * empty, every admin action counted one on the Refresh badge their own refresh
 * had just cleared, and it climbed for as long as they worked. Both ends of
 * the window are recorded now and `src/lib/refreshCoverage.ts` is the
 * judgement, with the reasoning and the trade written out there.
 *
 * Deliberately module state rather than context: the comparison has no
 * bearing on rendering, and a provider would mean threading it through the
 * four shells and every control that refreshes.
 */
let lastRefreshStartedAtMs = 0;
// When that refresh landed. Below `lastRefreshStartedAtMs` means one is still
// running, which is the state that covers the page's own news -- see
// `isCoveredByRefresh`.
let lastRefreshSettledAtMs = 0;
const listeners = new Set<() => void>();

/** Called by `useRouter().refresh()` -- every deliberate refresh in the app. */
export function markLocalRefresh(): void {
  lastRefreshStartedAtMs = Date.now();
  // Whatever was waiting to be read has now been asked for, wherever the
  // refresh came from -- the Refresh button, or any control that mutates and
  // refreshes. The badge that counts waiting changes listens here rather
  // than being cleared by its own button, or a control's own refresh would
  // leave a count standing for changes it had just fetched.
  for (const listener of listeners) listener();
}

/** Subscribe to every deliberate refresh. Returns the unsubscribe. */
export function onLocalRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Called when that refresh has actually landed -- `useRouter` marks it off the
 * transition, which is the only thing that honestly knows. A settle that never
 * arrives cannot wedge the suppression on: `isCoveredByRefresh` caps how long
 * a refresh is assumed to still be running.
 */
export function markLocalRefreshSettled(): void {
  lastRefreshSettledAtMs = Date.now();
}

export function lastLocalRefreshAtMs(): number {
  return lastRefreshStartedAtMs;
}

export function lastLocalRefreshSettledAtMs(): number {
  return lastRefreshSettledAtMs;
}

/** Has this browser's own refreshing already read the write behind this event? */
export function isEventCoveredByLocalRefresh(eventArrivedAtMs: number): boolean {
  return isCoveredByRefresh({
    eventArrivedAtMs,
    refreshStartedAtMs: lastRefreshStartedAtMs,
    refreshSettledAtMs: lastRefreshSettledAtMs,
  });
}
