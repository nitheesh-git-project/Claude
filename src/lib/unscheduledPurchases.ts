/**
 * A purchase that was paid for, or agreed at the door, and has never had a
 * single appointment booked against it.
 *
 * This is the one state in the product where the clinic has taken a decision
 * from a patient and delivered nothing at all, and nothing looked for it. The
 * patient is not stranded -- the balance is on their Programmes screen and
 * unbooked sessions are a pinned item on their own dashboard -- and that is
 * precisely the failure: every mechanism pointed at the patient, so a
 * purchase made by somebody who paid and was then distracted waits on the one
 * person least likely to come back to it, with nobody at the clinic able to
 * see it and ring them.
 *
 * Dependency-free and unit-tested, like every other judgement in `src/lib`:
 * what counts as "nothing booked" decides who gets a phone call.
 */

/**
 * How long a purchase may sit with nothing booked before an admin is told.
 *
 * A day rather than an hour. The scheduler opens with the whole run already
 * proposed from the clinician's own cadence, so most patients book within
 * minutes; the ones who do not are usually deciding rather than stuck.
 * Ringing somebody the same afternoon they paid reads as chasing, and a row
 * that is on every time anybody buys anything is a row nobody reads -- the
 * same reason `pay_later_aged_after_days` exists rather than warning on every
 * balance.
 */
export const PURCHASE_UNSCHEDULED_AFTER_HOURS = 24;

export type SchedulablePurchase = {
  status: string;
  /** `paid` for anything through the gateway. */
  paymentStatus: string;
  /**
   * `cash_on_visit` for a home visit collected at the door -- the column's
   * own value, matching `home_visit_package_purchases.payment_mode`. Such a purchase sits at
   * `unpaid` for its whole life **by design**, so judging it by
   * `paymentStatus` alone would drop every cash purchase silently -- the
   * mistake this codebase corrects wherever a home visit's money is read.
   */
  paymentMode?: string | null;
  completedCount: number;
  scheduledCount: number;
  createdAt: string;
};

/**
 * Whether this purchase is one nobody at the clinic can currently see is
 * stuck.
 *
 * Four conditions, and each excludes a case that is not this one:
 *
 * - **Still active.** A refunded, cancelled, expired or completed purchase
 *   has already been dealt with; chasing it would be chasing a decision
 *   somebody made.
 * - **Money was committed** -- paid, or a cash visit agreed at the door.
 *   An abandoned checkout is `unpaid` with no mode and is not a purchase at
 *   all, which is the same distinction `payment_terms` exists to make one
 *   table over.
 * - **Nothing booked, ever.** Not "has sessions left" -- most active
 *   purchases do, by definition, and a row that counts them counts almost
 *   every purchase the clinic has ever made. The finding is the run that
 *   never started.
 * - **Past the grace window**, so a purchase on its way to the scheduler is
 *   not reported as a fault a few seconds after it is made.
 */
export function isAwaitingFirstBooking(
  purchase: SchedulablePurchase,
  nowMs: number,
  afterHours: number = PURCHASE_UNSCHEDULED_AFTER_HOURS
): boolean {
  if (purchase.status !== "active") return false;

  const committed =
    purchase.paymentStatus === "paid" || (purchase.paymentMode ?? null) === "cash_on_visit";
  if (!committed) return false;

  if (purchase.completedCount > 0 || purchase.scheduledCount > 0) return false;

  const createdMs = Date.parse(purchase.createdAt);
  // An unreadable date is not treated as old. A row this function cannot
  // date is one it cannot judge, and inventing an age would put a patient on
  // a call list for a timestamp nobody could read.
  if (!Number.isFinite(createdMs)) return false;

  return nowMs - createdMs >= Math.max(0, afterHours) * 3_600_000;
}

/** How many of these there are, across both kinds of purchase. */
export function countAwaitingFirstBooking(
  purchases: readonly SchedulablePurchase[],
  nowMs: number,
  afterHours: number = PURCHASE_UNSCHEDULED_AFTER_HOURS
): number {
  return purchases.reduce(
    (total, p) => total + (isAwaitingFirstBooking(p, nowMs, afterHours) ? 1 : 0),
    0
  );
}
