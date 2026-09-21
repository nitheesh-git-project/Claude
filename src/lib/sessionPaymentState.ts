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
