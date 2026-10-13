/**
 * Finishing payment for a booking that was left unpaid.
 *
 * Pay on an unpaid session used to open Razorpay straight from the dashboard
 * card, with no code field and no breakdown -- so a patient whose first
 * attempt failed after they had applied a promo code was asked for the full
 * price and had no way to apply it again. Every unpaid online booking now
 * finishes in the booking wizard's own Step 3 (`/book?resume=<id>`): the
 * same summary, price breakdown, code field and Pay button as the first
 * attempt, one checkout everywhere. `/api/appointments/resume` answers
 * whether a booking can be resumed and with what.
 *
 * Dependency-free so the rules can be tested without a database.
 */

export type ResumableRow = {
  status: string;
  payment_status: string;
  payment_terms: string | null;
  visit_mode: string | null;
  therapist_id: string | null;
  package_purchase_id: string | null;
  home_visit_purchase_id: string | null;
  referral_id: string | null;
  pay_later_outcome: string | null;
  slot_time: string | null;
};

export type ResumeDecision =
  /** Step 3, with the booking as it is. */
  | { state: "ready" }
  /** The time has passed or is now inside the lead time: Step 1 with the
   *  service kept, and the new booking replaces this draft. */
  | { state: "pick_new_time" }
  /** Already paid -- nothing to finish. */
  | { state: "paid" }
  /** Something this checkout cannot finish, said in words. */
  | { state: "not_resumable"; message: string };

/**
 * True for a booking the online wizard can finish: an online session paid up
 * front, not drawn from a programme or a home-visit purchase. A home visit
 * has its own wizard, and a session on terms is never paid here.
 */
export function canResumeInWizard(row: {
  visit_mode: string | null;
  payment_terms: string | null;
  package_purchase_id: string | null;
  home_visit_purchase_id: string | null;
}): boolean {
  return (
    (row.visit_mode ?? "online") === "online" &&
    (row.payment_terms ?? "prepaid") === "prepaid" &&
    row.package_purchase_id === null &&
    row.home_visit_purchase_id === null
  );
}

/**
 * What resuming this booking does. `replaceable` is `isReplaceableDraft` for
 * the same row: only a draft nothing has been committed against can be moved
 * to a new time by booking again, because `/api/appointments/create` replaces
 * nothing else.
 */
export function decideResume(
  row: ResumableRow,
  { nowMs, leadTimeMs, replaceable }: { nowMs: number; leadTimeMs: number; replaceable: boolean }
): ResumeDecision {
  if (row.payment_status === "paid") return { state: "paid" };
  if (row.status === "cancelled") {
    return {
      state: "not_resumable",
      message: "This booking was cancelled, so there's nothing to pay. Book a new session instead.",
    };
  }
  if (row.status !== "requested" && row.status !== "confirmed") {
    return { state: "not_resumable", message: "This session can't be paid for any more." };
  }
  if (!canResumeInWizard(row) || row.pay_later_outcome !== null) {
    return {
      state: "not_resumable",
      message: "This session is paid a different way. Pay for it from your dashboard.",
    };
  }
  const slotMs = row.slot_time ? new Date(row.slot_time).getTime() : NaN;
  if (Number.isNaN(slotMs) || slotMs < nowMs + leadTimeMs) {
    if (replaceable) return { state: "pick_new_time" };
    return {
      state: "not_resumable",
      message:
        "That time isn't available any more, and this session has already been arranged with a therapist. Please contact us to move it.",
    };
  }
  return { state: "ready" };
}

/** Where Pay on an unpaid online session goes. */
export function resumeCheckoutHref(appointmentId: string): string {
  return `/book?resume=${encodeURIComponent(appointmentId)}`;
}

/**
 * The wizard's date key (YYYY-MM-DD) and hour for an instant, in the zone
 * the wizard's own picker uses -- the browser's. The picker composes
 * `${date}T${hour}:00` and reads it back in the same zone, so the two
 * round-trip exactly for a whole-hour slot.
 */
export function wizardSlotParts(iso: string): { dateKey: string; hour: number } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    dateKey: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hour: d.getHours(),
  };
}
