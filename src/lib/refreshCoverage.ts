/**
 * Whether a realtime change has already been read by this browser's own
 * most recent refresh.
 *
 * `RealtimeRefresh` asks this before it acts on an event, and on the admin
 * dashboard "acts" means counting one on the Refresh button's badge. The
 * answer matters because almost every event that reaches an open admin
 * dashboard is that dashboard's own work coming back to it: a control's route
 * writes its row *and* an `admin_activity_log` entry, and the control has
 * already called `router.refresh()` itself.
 *
 * **The comparison this replaces was on the wrong side of the realtime hop.**
 * It asked whether the refresh had started *after* the event arrived -- and
 * for the browser's own work that can never be true. The order is always:
 * the route commits, the response comes back, the control refreshes, and only
 * then does the event describing that commit reach the browser. So the window
 * was empty, every action an admin took added one (two, across the two
 * channels) to a badge their own refresh had just cleared, and the count
 * climbed for as long as they kept working.
 *
 * So the refresh is a **window**, not an instant: it covers everything that
 * landed between the moment it was asked for and the moment it settled, plus
 * a short grace for the hop itself. Three facts decide the shape:
 *
 *  1. **The write is older than the refresh that reads it.** A control
 *     refreshes *after* its request resolved, so the row was committed before
 *     `refreshStartedAtMs`. The event is merely late news of it.
 *  2. **A refresh in flight still covers.** The admin dashboard's own render
 *     was measured at 3.5s, and the event arrives inside that. Waiting for
 *     the settle before covering anything would leave the whole of that
 *     window counting the page's own work.
 *  3. **The grace is for the hop, not for slack.** It is what separates "the
 *     event for the write we just made" from "something that happened
 *     afterwards", and nothing else -- so it is short.
 *
 * **What this trades, stated rather than hidden:** a change by *somebody else*
 * that lands inside that window is absorbed, and this browser is not told
 * about it. That is a real loss, and it is the better side of the trade: the
 * badge exists to say the screen is behind, and one that also counts the
 * reader's own taps is one they learn to ignore -- the same reasoning that
 * keeps a red health banner off a screen where it would always be showing.
 * The missed change is re-raised by the next one, and every figure it touched
 * is read fresh by the next refresh either way. The old behaviour leaned the
 * other way on purpose; it leaned too far, and this is the correction.
 */

/**
 * How long after a refresh has landed an event may still be that refresh's own
 * news.
 *
 * Realtime delivery is a websocket hop and is normally well under half a
 * second; this is generous enough for a slow connection and short enough that
 * a genuine change a second and a half later is still counted.
 */
export const REALTIME_HOP_GRACE_MS = 1_500;

/**
 * The longest a refresh is assumed to still be running.
 *
 * A refresh in flight covers everything, so a settle that never arrives --
 * a transition that died, a component unmounted at the wrong moment -- would
 * wedge the badge off permanently, which is a worse failure than the one this
 * module exists to fix: the admin would be told nothing ever changes. Same
 * guard, and the same reasoning, as the 20s expiry on `LinkProgress`'s
 * pending marker. Comfortably longer than the 3.5s this dashboard's own
 * render was measured at.
 */
export const MAX_REFRESH_IN_FLIGHT_MS = 20_000;

export type RefreshCoverage = {
  /** When the event reached this browser. */
  eventArrivedAtMs: number;
  /** When this browser last asked for a refresh. 0 means it never has. */
  refreshStartedAtMs: number;
  /**
   * When that refresh landed. Anything below `refreshStartedAtMs` -- 0 on the
   * first one, or the previous refresh's settle on a later one -- means it is
   * still in flight.
   */
  refreshSettledAtMs: number;
  graceMs?: number;
  maxInFlightMs?: number;
};

export function isCoveredByRefresh({
  eventArrivedAtMs,
  refreshStartedAtMs,
  refreshSettledAtMs,
  graceMs = REALTIME_HOP_GRACE_MS,
  maxInFlightMs = MAX_REFRESH_IN_FLIGHT_MS,
}: RefreshCoverage): boolean {
  // Nothing has been re-read, so nothing is covered. This is the case on a
  // freshly loaded page, where every change really is news.
  if (refreshStartedAtMs <= 0) return false;

  // A refresh still running covers everything, including what arrived before
  // it started -- it has not read the database yet, so it will. The admin
  // dashboard's render was measured at 3.5s and its own news lands inside
  // that, so a window that began only once the refresh settled would spend
  // the whole of it counting the page's own work.
  if (refreshSettledAtMs < refreshStartedAtMs) {
    return eventArrivedAtMs < refreshStartedAtMs + maxInFlightMs;
  }

  // Settled: the hop is all that is left to allow for.
  return eventArrivedAtMs < refreshSettledAtMs + graceMs;
}
