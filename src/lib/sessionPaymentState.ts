// What a session's payment says, everywhere a session is shown.
//
// The companion to refundState.ts, and it exists for the same reason: three
// surfaces printed `payment_status` raw -- `ProfileSessionList`, the drawer,
// and the export the drawer's table produces -- so the moment a second axis
// arrived they would have described it three ways, or not at all.
//
// `payment_terms` is that second axis. A trusted patient's delivered session
// sits at `payment_status = 'unpaid'` for its whole life and is **not** an
// abandoned checkout: one is money the clinic is waiting for and the other is
// money that was never owed. Printed raw they are the same word, and "Unpaid"
// against a patient of two years is both wrong and, on a screen somebody acts
// from, actively misleading.
//
// Dependency-free so the vocabulary is unit-tested rather than discovered on
// a live clinic's screens.

export type SessionPaymentState =
  | "paid"
  /** Delivered on terms and waiting to be settled. Owed. */
  | "pay_later_open"
  /** On terms, not yet delivered. Owes nothing -- nothing has happened yet. */
  | "pay_later_pending"
  /** Settled, or written off. The thread is closed either way. */
  | "pay_later_closed"
  /** An ordinary abandoned checkout. */
  | "unpaid"
  | "failed";

export type SessionPaymentTone = "good" | "warn" | "bad" | "neutral";

export type SessionPaymentRow = {
  status?: string | null;
  payment_status?: string | null;
  payment_terms?: string | null;
  pay_later_outcome?: string | null;
};

export type SessionPaymentDescription = {
  state: SessionPaymentState;
  /** The chip. Short enough to sit beside the refund chip on a table row. */
  label: string;
  tone: SessionPaymentTone;
  /** True when the clinic is waiting to be paid for work it has done. */
  owed: boolean;
  /** True when this session is on terms at all, delivered or not. */
  onTerms: boolean;
};

/** Is this session one the clinic agreed to be paid for afterwards? */
export function isPayLaterSession(a: SessionPaymentRow): boolean {
  return a.payment_terms === "pay_later";
}

/**
 * One reading of a session's payment columns.
 *
 * A column that was not *loaded* (`undefined`) is treated as absent rather
 * than as evidence, the same rule `meetSyncState` follows: these columns come
 * from isolated migration-tolerant queries, and a select that did not ask for
 * `payment_terms` must describe an ordinary session rather than guess.
 */
export function describeSessionPayment(a: SessionPaymentRow): SessionPaymentDescription {
  const paid = a.payment_status === "paid";

  if (!isPayLaterSession(a)) {
    if (paid) return { state: "paid", label: "Paid", tone: "good", owed: false, onTerms: false };
    if (a.payment_status === "failed") {
      return { state: "failed", label: "Payment failed", tone: "bad", owed: false, onTerms: false };
    }
    return { state: "unpaid", label: "Unpaid", tone: "warn", owed: false, onTerms: false };
  }

  // Settled through the gateway, or paid off -- either way nothing is owed.
  if (paid) {
    return { state: "pay_later_closed", label: "Settled", tone: "good", owed: false, onTerms: true };
  }
  // A written-off debt is not owed. It is a cost, recorded elsewhere.
  if (a.pay_later_outcome === "written_off") {
    return { state: "pay_later_closed", label: "Written off", tone: "neutral", owed: false, onTerms: true };
  }
  // Delivered is the one word the whole arrangement keys on: before it
  // nothing is owed, after it everything is -- the debt, the revenue and the
  // therapist's share all at once.
  if (a.status === "completed") {
    return { state: "pay_later_open", label: "Owed", tone: "warn", owed: true, onTerms: true };
  }
  // Booked, cancelled, or anything else that never reached delivery. A late
  // cancellation lands here and owes nothing, with no special case: it simply
  // never became `completed`.
  return { state: "pay_later_pending", label: "Pay later", tone: "neutral", owed: false, onTerms: true };
}

/**
 * The same session, read by the patient whose session it is.
 *
 * `describeRefundForPatient` applied to the other direction of money, and for
 * the same reason: the two readings differ in what they are *for*, not only in
 * register. The chip above answers an admin's "what is happening with this
 * money"; this one answers "is there anything I need to do".
 *
 * Two states genuinely differ, and one of them is the reason this exists.
 * **"Written off" must never reach the patient.** It is the clinic's own
 * accounting word for a debt it has decided to stop chasing -- a decision
 * about them, taken without them, and printing it on their session card tells
 * somebody the clinic gave up on them. What is true for *them* is that there
 * is nothing to pay, which is what it says. And a cancelled session on terms
 * says **nothing at all**: the cancelled card already explains itself, and a
 * payment chip beside it announces an arrangement that never came into play,
 * exactly as `not_eligible` says nothing on a refund.
 *
 * `null` means render no chip. Everything else is the admin's own wording,
 * because those readings are already true for both.
 */
export function describeSessionPaymentForPatient(
  a: SessionPaymentRow
): SessionPaymentDescription | null {
  const admin = describeSessionPayment(a);
  if (!admin.onTerms) return admin;

  if (admin.state === "pay_later_closed") {
    // Settled reads the same to both. Written off does not.
    if (a.pay_later_outcome === "written_off") {
      return { ...admin, label: "Nothing to pay", tone: "good" };
    }
    return admin;
  }
  if (a.status === "cancelled") return null;
  return admin;
}
