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
