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

import { formatInr } from "@/lib/formatMoney";

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
 * Where a session's money stands, as one set of figures every refund control
 * and label reads -- the cancellation line, the payment chip's refund half,
 * the "still refundable" figure, the partial-refund form's ceiling, and the
 * cap the refund routes enforce.
 *
 * The rule it encodes: `refund_amount_paise` is the **running total of money
 * committed back** -- gone back (`processed`), or decided and waiting on a
 * person (`manual_pending`). `refund_status` is the state of the **latest**
 * refund decision, and it does not erase the total before it:
 *
 *   - `failed` -- the latest attempt was refused. It refunded nothing, so it
 *     adds nothing; the amount on the row is what earlier refunds already
 *     returned. A failed attempt is never counted as refunded.
 *   - `not_eligible` -- the latest decision was "nothing more is due". The
 *     amount is again what earlier refunds returned (0 on a session that had
 *     none).
 *
 * QA F-22 is why this exists. A ₹1,999 session refunded ₹200 then ₹100, then
 * cancelled: the cancellation asked the gateway for the full ₹1,999 (more than
 * was left, so it was refused), the row went to `failed`, and the drawer then
 * read "Paid / Refund failed", "₹1,699 refundable" and -- under Cancellation --
 * "No payment to refund", three answers from three readings of two columns.
 *
 * Dependency-free and unit-tested.
 */
export type RefundPosition = {
  state: RefundState;
  /** What the patient was charged for this session (service line plus any
   *  travel the gateway took). */
  paidPaise: number;
  /** Money that has actually gone back. */
  refundedPaise: number;
  /** Decided, and waiting on a person to hand it over. */
  owedBackPaise: number;
  /** `paid - refunded - owed back`, never below zero: the ceiling on any
   *  further refund. */
  refundablePaise: number;
  /** The latest refund attempt was refused, and somebody has to act. */
  failed: boolean;
};

export function describeRefundPosition(
  row: RefundRow | null | undefined,
  paidPaise: number | null | undefined
): RefundPosition {
  const refund = describeRefund(row);
  const paid = typeof paidPaise === "number" && paidPaise > 0 ? paidPaise : 0;
  const committed = Math.max(0, refund.amountPaise ?? 0);
  const refundedPaise = refund.state === "manual_pending" || refund.state === "none" ? 0 : committed;
  const owedBackPaise = refund.state === "manual_pending" ? committed : 0;
  // The whole committed total comes off, whatever the state -- the same
  // ceiling `refund-session-partial` enforces, so the figure an admin is
  // shown is the one the route will accept.
  const refundablePaise = Math.max(0, paid - committed);
  return {
    state: refund.state,
    paidPaise: paid,
    refundedPaise,
    owedBackPaise,
    refundablePaise,
    failed: refund.state === "failed",
  };
}

/**
 * Money that has actually gone back on a session -- what revenue nets off.
 * Processed refunds count; a failed attempt and a "nothing more is due"
 * decision count only what earlier refunds returned; a hand-back still
 * waiting on a person counts nothing yet.
 */
export function refundedPaiseOf(row: RefundRow | null | undefined): number {
  return describeRefundPosition(row, 0).refundedPaise;
}

/**
 * The "Cancellation" line on a cancelled session, from the same position.
 * `noRefundDue` is the sentence for a forfeiture, which the caller words
 * (it knows the window that applied and whether a payout was settled).
 */
export function describeCancellationRefund(
  position: RefundPosition,
  {
    noRefundDue,
    viaProgramme = false,
  }: { noRefundDue: string; viaProgramme?: boolean }
): string {
  const earlier =
    position.refundedPaise > 0 ? `${formatInr(position.refundedPaise)} refunded earlier` : null;
  switch (position.state) {
    case "processed":
      return position.refundablePaise > 0
        ? `${formatInr(position.refundedPaise)} refunded, ${formatInr(position.refundablePaise)} not refunded`
        : `${formatInr(position.refundedPaise)} refunded`;
    case "failed":
      // Whatever is left is what the refused attempt should have returned,
      // and it was not refunded -- a failure is never counted as money back.
      return earlier
        ? `${earlier}; the refund of the remaining ${formatInr(position.refundablePaise)} failed - refund it from this session`
        : `The refund of ${formatInr(position.refundablePaise)} failed - refund it from this session`;
    case "manual_pending":
      return `${formatInr(position.owedBackPaise)} to hand back to the patient`;
    case "not_eligible":
      return earlier ? `${noRefundDue}; ${earlier}` : noRefundDue;
    default:
      if (viaProgramme) return "Paid via a programme - no card payment to refund";
      return position.paidPaise > 0 ? "No refund recorded" : "No payment to refund";
  }
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
    // The gateway said no, and the clinic's own alert strip counts it as
    // urgent work. "Please contact us" put the job on the person who is out
    // of pocket; they are told who is doing it instead.
    return { ...admin, label: "Refund delayed - our team is sending it by hand" };
  }
  return admin;
}

/**
 * What the patient is told the moment their cancellation's refund is
 * refused. It used to be an error line on a button the refresh unmounted, so
 * all they actually saw was the success toast "Any refund due is on its
 * way" -- the opposite of what had happened.
 */
export function patientRefundDelayedNotice(amountPaise: number | null | undefined): string {
  const what = amountPaise != null && amountPaise > 0 ? `Your ${rupees(amountPaise)} refund` : "Your refund";
  return `Session cancelled. ${what} didn't go through automatically, so our team has been alerted and will send it by hand. You don't need to do anything.`;
}
