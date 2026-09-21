// Forgiving a debt a trusted patient is never going to settle, and taking
// that back.
//
// Dependency-free and unit-tested, the `decidePayLaterBooking` pattern, for
// the reason that one exists: the route and the control that calls it must
// not grow two answers to "why not". A named reason rather than a boolean,
// so the sentence a person reads is composed once.
//
// What this module deliberately does NOT decide is the money. A write-off
// moves no figure on the appointment -- revenue was recognised at completion
// and the therapist has already been paid -- so there is nothing here to
// compute. The only arithmetic is which amount to record as the loss, and
// that is the frozen price the session already carries.

export const WRITE_OFF_REASON_MIN_CHARS = 10;

/** Only the columns the judgement reads. Everything is optional-shaped the
 *  way the rest of the pay-later modules take rows, because these arrive
 *  from a migration-tolerant isolated read. */
export type WriteOffCandidate = {
  status?: string | null;
  payment_status?: string | null;
  payment_terms?: string | null;
  amount_due_paise?: number | null;
  pay_later_outcome?: string | null;
};

export type WriteOffRefusal =
  | "not_pay_later"
  | "not_completed"
  | "already_settled"
  | "already_written_off"
  | "no_frozen_price";

export type ReverseRefusal = "not_written_off";

export type WriteOffDecision =
  | { allowed: true; amountPaise: number }
  | { allowed: false; reason: WriteOffRefusal };

export type ReverseDecision = { allowed: true } | { allowed: false; reason: ReverseRefusal };

/**
 * Whether this session's debt can be forgiven, and what the loss is worth.
 *
 * The order matters: the checks run from the most general fact about the
 * session to the most specific, so an admin looking at a prepaid session is
 * told it is not on terms rather than that it has no frozen price.
 *
 * `no_frozen_price` is last and is a real refusal rather than a fallback to
 * the standard fee. A session with no `amount_due_paise` owes an amount
 * nobody recorded, and writing the default fee into the books as the loss
 * would put a number in the clinic's costs that no screen can trace back to
 * anything. `complete-session` stamps the price precisely so this cannot
 * normally happen.
 */
export function decideWriteOff(a: WriteOffCandidate): WriteOffDecision {
  if (a.payment_terms !== "pay_later") return { allowed: false, reason: "not_pay_later" };
  if (a.status !== "completed") return { allowed: false, reason: "not_completed" };
  if (a.pay_later_outcome === "written_off") {
    return { allowed: false, reason: "already_written_off" };
  }
  // Settled is checked on both the outcome and the payment status: the
  // allocator writes the first, and a session marked paid any other way is
  // just as settled as far as this decision goes.
  if (a.pay_later_outcome === "settled" || a.payment_status === "paid") {
    return { allowed: false, reason: "already_settled" };
  }
  const amountPaise = a.amount_due_paise ?? null;
  if (amountPaise === null || !(amountPaise > 0)) {
    return { allowed: false, reason: "no_frozen_price" };
  }
  return { allowed: true, amountPaise };
}

/** The mirror. Only a written-off session can be brought back, and a session
 *  somebody settled in between is not one -- the allocator can never have
 *  touched it, since it skips written-off rows, but a hand-run UPDATE can. */
export function decideReverseWriteOff(a: WriteOffCandidate): ReverseDecision {
  if (a.pay_later_outcome !== "written_off") {
    return { allowed: false, reason: "not_written_off" };
  }
  return { allowed: true };
}

/**
 * Why not, in a sentence an admin can act on.
 *
 * `not_pay_later` and `not_completed` name the alternative rather than
 * stopping at the refusal: an admin who has opened this control has decided
 * not to collect, and being told only "no" leaves them looking for another
 * way to do the same thing off the books.
 */
export function writeOffRefusalMessage(reason: WriteOffRefusal): string {
  switch (reason) {
    case "not_pay_later":
      return "Only a session a patient was allowed to pay later for can be written off. For anything else, a goodwill adjustment or a refund is the lane.";
    case "not_completed":
      return "Nothing is owed on this session yet - it is only owed once it has been delivered and marked done. Cancel it instead if it is not going ahead.";
    case "already_settled":
      return "This session has already been paid for. Handing money back is a refund, which has its own control.";
    case "already_written_off":
      return "This session has already been written off.";
    case "no_frozen_price":
      return "This session carries no agreed price, so there is no figure to record as the loss. Open it and set the amount first.";
  }
}

export function reverseRefusalMessage(reason: ReverseRefusal): string {
  switch (reason) {
    case "not_written_off":
      return "This session is not written off, so there is nothing to bring back.";
  }
}

/**
 * What the cost row says it is, on the Costs screen months later.
 *
 * Names the patient and the session rather than the ids, because the row is
 * read by whoever is reconciling the books and "Bad debt - uuid" is a line
 * nobody can act on. The reason the admin typed is appended, since it is the
 * half explaining why the clinic chose to stop chasing.
 */
export function writeOffDescription({
  patientName,
  sessionCode,
  reason,
}: {
  patientName: string | null;
  sessionCode: string | null;
  reason: string;
}): string {
  const who = patientName?.trim() || "a patient";
  const which = sessionCode?.trim() ? ` (${sessionCode.trim()})` : "";
  return `Written off: session for ${who}${which} - ${reason.trim()}`;
}
