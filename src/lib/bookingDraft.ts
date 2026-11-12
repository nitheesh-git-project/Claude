// A "draft" is the unpaid booking the online wizard creates on the first Pay
// tap, before any money has moved. A patient who cancels the payment sheet
// and then goes Back, reloads, or reopens /book used to be refused their own
// slot -- "You already have a session scheduled around this time" -- because
// that abandoned draft still held it. A draft is now replaced by the patient's
// next booking instead (see /api/appointments/create).
//
// Dependency-free so the rule can be tested without a database.

export type DraftCandidate = {
  status: string;
  payment_status: string;
  therapist_id: string | null;
  visit_mode: string | null;
  payment_terms: string | null;
  package_purchase_id: string | null;
  home_visit_purchase_id: string | null;
  referral_id: string | null;
  pay_later_outcome: string | null;
};

/**
 * True only for a booking nothing has been committed against: still
 * `requested`, unpaid, prepaid terms, online, unassigned, and not drawn from a
 * package, a home-visit purchase or a hospital referral. Anything else is a
 * real booking somebody is relying on, and still blocks the slot.
 */
export function isReplaceableDraft(row: DraftCandidate): boolean {
  return (
    row.status === "requested" &&
    row.payment_status === "unpaid" &&
    row.therapist_id === null &&
    (row.visit_mode ?? "online") === "online" &&
    (row.payment_terms ?? "prepaid") === "prepaid" &&
    row.package_purchase_id === null &&
    row.home_visit_purchase_id === null &&
    row.referral_id === null &&
    row.pay_later_outcome === null
  );
}

/** Half-open interval overlap, in milliseconds. */
export function overlapsSlot(
  startMs: number,
  durationMinutes: number,
  otherStartMs: number,
  otherDurationMinutes: number
): boolean {
  const endMs = startMs + durationMinutes * 60_000;
  const otherEndMs = otherStartMs + otherDurationMinutes * 60_000;
  return otherStartMs < endMs && startMs < otherEndMs;
}

/** What the patient is told when a new time overlaps one of their own real
 *  bookings. One sentence, said on Step 1 (/api/appointments/check-slot) and
 *  again by the route that binds (/api/appointments/create). */
export const OWN_SLOT_CONFLICT_ERROR =
  "You already have a session scheduled around this time. Please pick a different slot, or check your dashboard for existing bookings.";

/**
 * Whether a new booking at `slotMs` for `durationMinutes` overlaps one of the
 * patient's own real bookings. The patient's unpaid online draft that this
 * booking would replace does not count (isReplaceableDraft), nor does the
 * one named in `replacesAppointmentId`. Pure, so Step 1's early check and
 * the create route give the same answer.
 */
export function ownSlotConflict<
  T extends DraftCandidate & { id: string; slot_time: string | null; duration_minutes: number | null }
>(
  existing: T[],
  slotMs: number,
  durationMinutes: number,
  baseDurationMinutes: number,
  replacesAppointmentId?: string | null
): { overlapping: T[]; replaceable: T[]; conflict: boolean } {
  const overlapping = existing.filter(
    (a) =>
      !!a.slot_time &&
      overlapsSlot(slotMs, durationMinutes, new Date(a.slot_time).getTime(), a.duration_minutes ?? baseDurationMinutes)
  );
  const replaceable = existing.filter(
    (a) =>
      isReplaceableDraft(a) &&
      (overlapping.includes(a) || (!!replacesAppointmentId && a.id === replacesAppointmentId))
  );
  return { overlapping, replaceable, conflict: overlapping.some((a) => !replaceable.includes(a)) };
}
