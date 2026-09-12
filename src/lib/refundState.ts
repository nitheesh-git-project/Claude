// What a refund on a session says, everywhere a session is shown.
//
// Money going out was recorded and never displayed. An admin refunded a
// session from a patient's profile, the route worked, the audit row was
// written -- and the session row it happened to went on looking exactly as
// it had, because `ProfileSessionList` renders `payment_status` and nothing
// about `refund_status` at all. The one question the screen could not answer
// was the one it most needed to: has this patient had their money back?
//
// So a refund reads like a payment does: on the row, in the drawer, on the
// patient's own card, in one vocabulary rather than four. Four states, and
// the difference between them is who is waiting for what:
//
//  - `processed`     -- the money has gone back. Nothing is owed.
//  - `manual_pending`-- cash taken at the door has no gateway payment behind
//                       it, so somebody has to hand it over. This is the one
//                       that is **work**, and the Cash Ledger counts it.
//  - `failed`        -- the gateway refused. Also work, and more urgent,
//                       because nobody is watching a failure that is not
//                       displayed.
//  - `not_eligible`  -- cancelled inside the refund window, so no money is
//                       due. Recorded rather than left blank, because "no
//                       refund" and "we never looked" read identically on a
//                       screen and mean opposite things.
//
// Dependency-free so the wording and the arithmetic are unit-tested rather
// than discovered on a live clinic's money.

export type RefundState = "none" | "processed" | "manual_pending" | "failed" | "not_eligible";

export type RefundTone = "good" | "warn" | "bad" | "neutral";

export type RefundRow = {
  refund_status?: string | null;
  refund_amount_paise?: number | null;
  refund_reason?: string | null;
  refund_is_manual?: boolean | null;
  refunded_at?: string | null;
};

export type RefundDescription = {
  state: RefundState;
  /** The chip. Short enough to sit beside the payment chip on a table row. */
  label: string;
  tone: RefundTone;
  /** True when somebody still has to do something. */
  needsPerson: boolean;
  amountPaise: number | null;
  reason: string | null;
  at: string | null;
};

function rupees(paise: number) {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

/**
 * One reading of a session's refund columns.
 *
 * A column that was not *loaded* (`undefined`) is treated the same as one
 * that is empty -- these come from selects that vary by screen, and the
 * alternative is every caller guessing. What it must never do is invent a
 * state: a row with no `refund_status` is `none`, not "not refunded", which
 * would be a claim about a decision nobody made.
 */
export function describeRefund(row: RefundRow | null | undefined): RefundDescription {
  const status = row?.refund_status ?? null;
  const amount = typeof row?.refund_amount_paise === "number" ? row.refund_amount_paise : null;
  const reason = row?.refund_reason?.trim() || null;
  const at = row?.refunded_at ?? null;

  const base = { amountPaise: amount, reason, at };

  if (status === "processed") {
    return {
      ...base,
      state: "processed",
      // The figure is the point: "Refunded" alone leaves an admin opening
      // the drawer to find out whether it was all of it or some of it.
      label: amount != null ? `Refunded ${rupees(amount)}` : "Refunded",
      tone: "good",
      needsPerson: false,
    };
  }
  if (status === "manual_pending") {
    return {
      ...base,
      state: "manual_pending",
      label: amount != null ? `Hand back ${rupees(amount)}` : "Refund by hand",
      tone: "warn",
      needsPerson: true,
    };
  }
  if (status === "failed") {
    return { ...base, state: "failed", label: "Refund failed", tone: "bad", needsPerson: true };
  }
  if (status === "not_eligible") {
    return {
      ...base,
      state: "not_eligible",
      label: "No refund due",
      tone: "neutral",
      needsPerson: false,
    };
  }
  return { ...base, state: "none", label: "", tone: "neutral", needsPerson: false };
}

/** Whether this session has anything to say about a refund at all. Callers
 *  use it to decide whether to render a chip, so `none` renders nothing
 *  rather than an empty one. */
export function hasRefund(row: RefundRow | null | undefined): boolean {
  return describeRefund(row).state !== "none";
}

/** A partial refund is one that gave back less than was paid. Worth naming
 *  separately: "Refunded ₹500" against a ₹1,200 session is a different fact
 *  from a full refund, and the books already record both the same way. */
export function isPartialRefund(
  row: RefundRow | null | undefined,
  amountPaidPaise: number | null | undefined
): boolean {
  const refund = describeRefund(row);
  if (refund.state !== "processed" || refund.amountPaise == null) return false;
  if (typeof amountPaidPaise !== "number" || amountPaidPaise <= 0) return false;
  return refund.amountPaise < amountPaidPaise;
}

/**
 * The same four states, in the patient's own words.
 *
 * A separate function rather than a `voice` flag on `describeRefund`,
 * because the two readings differ in what they are *for*, not only in
 * register. The admin chip answers "what happened to this money"; the
 * patient's line answers "am I getting my money back, and when" -- so
 * `manual_pending` is the clinic's work queue to an admin and a promise to
 * the patient, and `failed` is a broken row to an admin and "ring us" to
 * the person who is out of pocket. A shared string that tried to be both
 * would be honest to neither, which is the `voice` rule this codebase
 * already applies to the intake wizard.
 *
 * `not_eligible` returns `none` here on purpose: "No refund due" is a fact
 * about a decision, and the cancelled-session card already explains the
 * window it came from. Repeating it as a refund line would announce a
 * refund to somebody who is not getting one.
 */
export function describeRefundForPatient(
  row: RefundRow | null | undefined
): RefundDescription {
  const admin = describeRefund(row);
  if (admin.state === "not_eligible") {
    return { ...admin, state: "none", label: "", tone: "neutral", needsPerson: false };
  }
  if (admin.state === "processed") {
    return {
      ...admin,
      label: admin.amountPaise != null ? `${rupees(admin.amountPaise)} refunded` : "Refunded",
    };
  }
  if (admin.state === "manual_pending") {
    // Cash taken at the door. To the clinic this is a job; to the patient it
    // is a promise, and the only useful thing to say is that it is coming
    // and that nothing is required of them.
    return {
      ...admin,
      label:
        admin.amountPaise != null
          ? `${rupees(admin.amountPaise)} coming back to you`
          : "Refund on its way",
    };
  }
  if (admin.state === "failed") {
    return { ...admin, label: "Refund didn't go through — please contact us" };
  }
  return admin;
}
