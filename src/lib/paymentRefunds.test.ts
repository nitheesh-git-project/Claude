import { describe, expect, it } from "vitest";
import { refundsByPayment, refundsFor, type MirrorRefundRow, type SessionRefundRow } from "./paymentRefunds";

const mirrorRow = (over: Partial<MirrorRefundRow> = {}): MirrorRefundRow => ({
  razorpay_refund_id: "rfnd_A",
  razorpay_payment_id: "pay_1",
  amount_paise: 10000,
  status: "processed",
  source: "razorpay",
  at: "2026-11-11T16:50:46Z",
  ...over,
});

const sessionRow = (over: Partial<SessionRefundRow> = {}): SessionRefundRow => ({
  razorpay_payment_id: "pay_1",
  refund_status: "processed",
  refund_amount_paise: 10000,
  refunded_at: "2026-11-11T16:50:46Z",
  refund_id: "rfnd_A",
  ...over,
});

describe("refundsByPayment", () => {
  it("does not count a refund twice when the mirror applied it to the session", () => {
    const r = refundsFor(refundsByPayment([mirrorRow()], [sessionRow()]), "pay_1");
    expect(r.refundedPaise).toBe(10000);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({ refundId: "rfnd_A", status: "processed", madeOn: "razorpay" });
  });

  it("adds up several partial refunds on one payment", () => {
    const r = refundsFor(
      refundsByPayment(
        [mirrorRow(), mirrorRow({ razorpay_refund_id: "rfnd_B", amount_paise: 5000, source: "app", at: "2026-11-12T00:00:00Z" })],
        [sessionRow({ refund_amount_paise: 15000, refund_id: "rfnd_B" })]
      ),
      "pay_1"
    );
    expect(r.refundedPaise).toBe(15000);
    expect(r.lines.map((l) => l.refundId)).toEqual(["rfnd_A", "rfnd_B"]);
  });

  it("keeps a refund made before the mirror existed, from the session's own columns", () => {
    const r = refundsFor(refundsByPayment([], [sessionRow({ refund_id: "rfnd_OLD" })]), "pay_1");
    expect(r.refundedPaise).toBe(10000);
    expect(r.lines[0]).toMatchObject({ refundId: "rfnd_OLD", madeOn: null });
  });

  it("covers a programme payment that has no session at all", () => {
    const r = refundsFor(refundsByPayment([mirrorRow({ razorpay_payment_id: "pay_pkg" })], []), "pay_pkg");
    expect(r.refundedPaise).toBe(10000);
  });

  it("separates in-progress and failed refunds from money that went back", () => {
    const r = refundsFor(
      refundsByPayment(
        [mirrorRow({ status: "created" }), mirrorRow({ razorpay_refund_id: "rfnd_F", status: "failed" })],
        []
      ),
      "pay_1"
    );
    expect(r.refundedPaise).toBe(0);
    expect(r.inProgressPaise).toBe(10000);
    expect(r.failed).toBe(true);
  });

  it("answers nothing for a payment with no refunds", () => {
    expect(refundsFor(refundsByPayment([], []), "pay_x")).toEqual({
      refundedPaise: 0,
      inProgressPaise: 0,
      failed: false,
      lines: [],
    });
    expect(refundsFor(new Map(), null).refundedPaise).toBe(0);
  });
});
