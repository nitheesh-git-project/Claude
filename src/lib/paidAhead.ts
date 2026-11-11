import { refundedPaiseOf, type RefundRow } from "@/lib/refundState";

/**
 * Money already paid for sessions that fall after the end of a date range.
 *
 * The money screens count a session's money on the session's own date
 * (`filterBySlotRange`), which is right for revenue: the clinic earns it by
 * delivering the session. But it means a patient who pays today for a session
 * tomorrow appears nowhere on a range that ends today, and the owner reads that
 * as a missing payment. This is the figure that answers "where is it?" without
 * moving revenue: what came in by the end of the range for sessions still to
 * come after it.
 *
 * Cancelled sessions are left out: their money is settled (refunded or kept as
 * a late-cancellation fee), not waiting on a session. A session covered by a
 * programme is left out too, since its money is the programme's and is counted
 * with the purchase.
 */
export type PaidAheadAppointment = RefundRow & {
  slot_time: string | null;
  paid_at: string | null;
  status: string | null;
  payment_status: string | null;
  amount_paid_paise: number | null;
  package_purchase_id?: string | null;
};

export type PaidAhead = {
  count: number;
  paidPaise: number;
  refundedPaise: number;
  netPaise: number;
  /** The latest of those sessions, so a screen can widen its range to it. */
  latestSlotTime: string | null;
};

export function paidAheadOf(
  appointments: PaidAheadAppointment[],
  rangeEndMs: number
): PaidAhead {
  let count = 0;
  let paidPaise = 0;
  let refundedPaise = 0;
  let latestSlotTime: string | null = null;
  for (const a of appointments) {
    if (a.payment_status !== "paid" || !a.paid_at || !a.slot_time) continue;
    if (a.status === "cancelled") continue;
    if (a.package_purchase_id) continue;
    const amount = a.amount_paid_paise ?? 0;
    if (amount <= 0) continue;
    if (new Date(a.slot_time).getTime() < rangeEndMs) continue;
    if (new Date(a.paid_at).getTime() >= rangeEndMs) continue;
    count += 1;
    paidPaise += amount;
    refundedPaise += Math.min(amount, refundedPaiseOf(a));
    if (!latestSlotTime || new Date(a.slot_time).getTime() > new Date(latestSlotTime).getTime()) {
      latestSlotTime = a.slot_time;
    }
  }
  return {
    count,
    paidPaise,
    refundedPaise,
    netPaise: Math.max(0, paidPaise - refundedPaise),
    latestSlotTime,
  };
}
