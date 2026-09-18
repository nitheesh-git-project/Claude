"use client";

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
 * A change is redundant when this browser started a refresh *after* it
 * arrived: that fetch already read the row. Comparing timestamps rather than
 * tagging events is what makes it work across both realtime channels and
 * across every control in the app, none of which knows which rows its route
 * touched.
 *
 * Deliberately module state rather than context: the comparison has no
 * bearing on rendering, and a provider would mean threading it through the
 * four shells and every control that refreshes.
 */
let lastRefreshStartedAtMs = 0;

/** Called by `useRouter().refresh()` -- every deliberate refresh in the app. */
export function markLocalRefresh(): void {
  lastRefreshStartedAtMs = Date.now();
}

export function lastLocalRefreshAtMs(): number {
  return lastRefreshStartedAtMs;
}
