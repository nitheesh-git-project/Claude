// Refunds, as Razorpay reports them.
//
// The webhook used to act on `payment.captured` only. A refund made on the
// Razorpay website never reached the app -- the session went on reading
// Paid and every money figure went on counting it -- and a refund the app
// started was recorded as done the moment Razorpay accepted it, with
// nothing to say later if the bank failed it.
//
// Razorpay sends `refund.created`, `refund.processed` and `refund.failed`.
// Each is mirrored in `razorpay_refunds` (one row per refund id, following
// its status), and then one of these happens, decided here:
//
// - **The app started it** (a `refund_attempts` row carries its id): the
//   booking already says Refunded. `processed` changes nothing; `failed`
//   turns a session's refund to Failed, which every screen already shows as
//   work for a person (refundState.ts), because the patient does not have
//   their money.
// - **Somebody refunded on Razorpay**, against a single session's payment:
//   once it is `processed`, the session is recorded as refunded -- amount,
//   time, the refund id, "Refunded on Razorpay" -- exactly the fields an
//   in-app partial refund writes, so Transactions, the patient's receipt
//   and the money figures all follow. The session itself is not cancelled:
//   whether the session still happens is the clinic's decision, not the
//   refund's.
// - **Against a programme or home-visit purchase, or a payment nothing
//   matches**: listed as "needs review" on Money -> Refunds. A programme
//   refund decides sessions, credits and a therapist's pay, which is not a
//   thing to infer from an amount.
//
// The pure half (parsing, deciding) is here and unit-tested; the database
// half is razorpayRefundSyncServer.ts.

export type RefundStatus = "created" | "pending" | "processed" | "failed";

export type ParsedRefundEvent = {
  eventType: "refund.created" | "refund.processed" | "refund.failed";
  refundId: string;
  paymentId: string;
  amountPaise: number;
  status: RefundStatus;
  createdAt: string | null;
  speed: string | null;
};

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function isRefundEventType(t: unknown): t is ParsedRefundEvent["eventType"] {
  return t === "refund.created" || t === "refund.processed" || t === "refund.failed";
}

/** A refund event's payload, made safe; null when it is not one or cannot
 *  be read. The status follows the event when the entity's own is missing. */
export function parseRefundEvent(event: unknown): ParsedRefundEvent | null {
  const e = obj(event);
  const eventType = e?.event;
  if (!isRefundEventType(eventType)) return null;
  const refund = obj(obj(obj(e?.payload)?.refund)?.entity);
  if (!refund) return null;
  const refundId = typeof refund.id === "string" && /^rfnd_[A-Za-z0-9]+$/.test(refund.id) ? refund.id : null;
  const paymentId = typeof refund.payment_id === "string" && refund.payment_id.startsWith("pay_") ? refund.payment_id : null;
  const amount = typeof refund.amount === "number" && Number.isInteger(refund.amount) && refund.amount > 0 ? refund.amount : null;
  if (!refundId || !paymentId || amount === null) return null;
  const fromEvent: RefundStatus =
    eventType === "refund.processed" ? "processed" : eventType === "refund.failed" ? "failed" : "created";
  const raw = refund.status;
  const status: RefundStatus =
    raw === "processed" || raw === "failed" || raw === "pending" || raw === "created" ? raw : fromEvent;
  const created = typeof refund.created_at === "number" ? new Date(refund.created_at * 1000).toISOString() : null;
  return {
    eventType,
    refundId,
    paymentId,
    amountPaise: amount,
    // A later event never moves a refund back: a `created` arriving after
    // `processed` (Razorpay does not promise order) keeps the stronger one.
    status,
    createdAt: created,
    speed: typeof refund.speed_processed === "string" ? refund.speed_processed : typeof refund.speed === "string" ? refund.speed : null,
  };
}

const RANK: Record<RefundStatus, number> = { created: 0, pending: 1, processed: 2, failed: 2 };

/** The status to store, given the one already stored: never backwards. */
export function nextRefundStatus(stored: RefundStatus | null, incoming: RefundStatus): RefundStatus {
  if (!stored) return incoming;
  return RANK[incoming] >= RANK[stored] ? incoming : stored;
}

export type RefundSubject =
  | { kind: "appointment"; id: string; patientId: string | null; amountPaidPaise: number | null; refundStatus: string | null; refundId: string | null; refundAmountPaise: number | null }
  | { kind: "package_purchase"; id: string; patientId: string | null }
  | { kind: "home_visit_purchase"; id: string; patientId: string | null }
  | { kind: "none" };

export type RefundDecision =
  | { action: "record_on_session"; refundAmountPaise: number; reason: string }
  | { action: "mark_session_failed"; reason: string }
  | { action: "nothing"; applied: "already" | "not_needed" | "pending" }
  | { action: "review"; note: string };

/**
 * What the app does about one refund, now.
 *
 * `processedTotalPaise` is every processed refund against this payment,
 * this one included -- a payment can be refunded in parts, and the session
 * records the total, capped at what was paid.
 */
export function decideRefund(input: {
  source: "app" | "razorpay";
  status: RefundStatus;
  refundId: string;
  subject: RefundSubject;
  processedTotalPaise: number;
}): RefundDecision {
  const { source, status, subject } = input;
  if (status === "created" || status === "pending") return { action: "nothing", applied: "pending" };

  if (source === "app") {
    if (status === "processed") return { action: "nothing", applied: "already" };
    if (subject.kind === "appointment") {
      return { action: "mark_session_failed", reason: "Razorpay could not complete this refund. The patient has not been paid back." };
    }
    return { action: "review", note: "Razorpay could not complete this refund. The patient has not been paid back." };
  }

  // Made on Razorpay.
  if (status === "failed") return { action: "nothing", applied: "not_needed" };
  if (subject.kind === "none") {
    return { action: "review", note: "Refunded on Razorpay against a payment this app has no booking for." };
  }
  if (subject.kind !== "appointment") {
    return {
      action: "review",
      note: "Refunded on Razorpay against a programme. Decide its sessions and the therapist's pay on the programme itself.",
    };
  }
  const paid = subject.amountPaidPaise ?? 0;
  const total = Math.min(input.processedTotalPaise, paid > 0 ? paid : input.processedTotalPaise);
  if (subject.refundStatus === "processed" && (subject.refundAmountPaise ?? 0) >= total) {
    return { action: "nothing", applied: "already" };
  }
  return { action: "record_on_session", refundAmountPaise: total, reason: `Refunded on Razorpay (${input.refundId})` };
}

/** The words for a refund's status on Money -> Refunds. */
export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  created: "Started",
  pending: "On its way",
  processed: "Refunded",
  failed: "Failed",
};
