import { refundedPaiseOf, type RefundRow } from "@/lib/refundState";

/**
 * Everything refunded against one Razorpay payment, for the Transactions
 * screen's Refunded column and the refund lines on a receipt.
 *
 * Two sources, because neither is complete on its own:
 * - `razorpay_refunds`, the mirror of every refund Razorpay reports (made in
 *   the app or on the Razorpay website), for sessions, programmes and
 *   home-visit packs alike;
 * - the session's own refund columns, which also hold refunds made before the
 *   mirror existed.
 * Both describe the same running total for a payment, so the larger of the two
 * is taken, never the sum: a refund the mirror applied to a session sits in
 * both, and adding them would count it twice.
 */
export type MirrorRefundRow = {
  razorpay_refund_id: string;
  razorpay_payment_id: string;
  amount_paise: number;
  status: string;
  source: string;
  at: string | null;
};

export type SessionRefundRow = RefundRow & {
  razorpay_payment_id: string | null;
  refund_id?: string | null;
};

export type RefundLine = {
  refundId: string | null;
  amountPaise: number | null;
  status: "processed" | "in_progress" | "failed";
  /** Where it was made, when known: in the app, or on the Razorpay website. */
  madeOn: "app" | "razorpay" | null;
  at: string | null;
};

export type PaymentRefunds = {
  refundedPaise: number;
  inProgressPaise: number;
  failed: boolean;
  lines: RefundLine[];
};

const EMPTY: PaymentRefunds = { refundedPaise: 0, inProgressPaise: 0, failed: false, lines: [] };

function lineStatus(status: string): RefundLine["status"] {
  if (status === "processed") return "processed";
  if (status === "failed") return "failed";
  return "in_progress";
}

export function refundsByPayment(
  mirror: MirrorRefundRow[],
  sessions: SessionRefundRow[]
): Map<string, PaymentRefunds> {
  const out = new Map<string, PaymentRefunds>();
  const get = (paymentId: string) => {
    let entry = out.get(paymentId);
    if (!entry) {
      entry = { refundedPaise: 0, inProgressPaise: 0, failed: false, lines: [] };
      out.set(paymentId, entry);
    }
    return entry;
  };

  const seen = new Set<string>();
  for (const r of mirror) {
    if (!r.razorpay_payment_id) continue;
    const entry = get(r.razorpay_payment_id);
    const status = lineStatus(r.status);
    if (status === "processed") entry.refundedPaise += r.amount_paise;
    else if (status === "in_progress") entry.inProgressPaise += r.amount_paise;
    else entry.failed = true;
    entry.lines.push({
      refundId: r.razorpay_refund_id,
      amountPaise: r.amount_paise,
      status,
      madeOn: r.source === "razorpay" ? "razorpay" : "app",
      at: r.at,
    });
    seen.add(r.razorpay_refund_id);
  }

  for (const s of sessions) {
    if (!s.razorpay_payment_id || !s.refund_status) continue;
    const refunded = refundedPaiseOf(s);
    const failed = s.refund_status === "failed";
    if (refunded <= 0 && !failed) continue;
    const entry = get(s.razorpay_payment_id);
    entry.refundedPaise = Math.max(entry.refundedPaise, refunded);
    if (failed && entry.lines.length === 0) entry.failed = true;
    // A refund the mirror never saw (made before it existed) still gets a line.
    if (!(s.refund_id && seen.has(s.refund_id)) && entry.lines.every((l) => l.status !== "processed")) {
      if (refunded > 0) {
        entry.lines.push({
          refundId: s.refund_id ?? null,
          amountPaise: refunded,
          status: "processed",
          madeOn: null,
          at: s.refunded_at ?? null,
        });
      }
    }
  }

  for (const entry of out.values()) {
    entry.lines.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  }
  return out;
}

export function refundsFor(
  map: Map<string, PaymentRefunds>,
  paymentId: string | null | undefined
): PaymentRefunds {
  return (paymentId && map.get(paymentId)) || EMPTY;
}
