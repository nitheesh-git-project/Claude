import { describe, expect, it } from "vitest";
import { decideRefund, nextRefundStatus, parseRefundEvent, type RefundSubject } from "./razorpayRefundSync";

const event = (type: string, entity: Record<string, unknown>) => ({ event: type, payload: { refund: { entity } } });
const refund = { id: "rfnd_ABC123", payment_id: "pay_TqSITHLtez0T67", amount: 49900, status: "processed", created_at: 1762850000, speed_processed: "normal" };
const session = (over: Partial<Extract<RefundSubject, { kind: "appointment" }>> = {}): RefundSubject => ({
  kind: "appointment",
  id: "a1",
  patientId: "p1",
  amountPaidPaise: 49900,
  refundStatus: null,
  refundId: null,
  refundAmountPaise: null,
  ...over,
});

describe("parseRefundEvent", () => {
  it("reads a Razorpay refund event", () => {
    expect(parseRefundEvent(event("refund.processed", refund))).toEqual({
      eventType: "refund.processed",
      refundId: "rfnd_ABC123",
      paymentId: "pay_TqSITHLtez0T67",
      amountPaise: 49900,
      status: "processed",
      createdAt: new Date(1762850000 * 1000).toISOString(),
      speed: "normal",
    });
  });

  it("refuses what is not a refund, or cannot be trusted", () => {
    expect(parseRefundEvent(event("payment.captured", refund))).toBeNull();
    expect(parseRefundEvent(event("refund.processed", { ...refund, id: "x; drop" }))).toBeNull();
    expect(parseRefundEvent(event("refund.processed", { ...refund, amount: -1 }))).toBeNull();
    expect(parseRefundEvent(event("refund.processed", { ...refund, payment_id: "order_1" }))).toBeNull();
    expect(parseRefundEvent(null)).toBeNull();
  });

  it("falls back to the event for the status", () => {
    expect(parseRefundEvent(event("refund.failed", { ...refund, status: undefined }))?.status).toBe("failed");
  });
});

describe("nextRefundStatus", () => {
  it("never moves a refund backwards when events arrive out of order", () => {
    expect(nextRefundStatus("processed", "created")).toBe("processed");
    expect(nextRefundStatus("created", "processed")).toBe("processed");
    expect(nextRefundStatus(null, "pending")).toBe("pending");
  });
});

describe("decideRefund", () => {
  const base = { refundId: "rfnd_ABC123", processedTotalPaise: 49900 };

  it("waits while a refund is still on its way", () => {
    expect(decideRefund({ ...base, source: "razorpay", status: "created", subject: session() })).toEqual({ action: "nothing", applied: "pending" });
  });

  it("an app refund that went through needs nothing; one the bank failed marks the session failed", () => {
    expect(decideRefund({ ...base, source: "app", status: "processed", subject: session() })).toEqual({ action: "nothing", applied: "already" });
    expect(decideRefund({ ...base, source: "app", status: "failed", subject: session() }).action).toBe("mark_session_failed");
    expect(decideRefund({ ...base, source: "app", status: "failed", subject: { kind: "package_purchase", id: "x", patientId: null } }).action).toBe("review");
  });

  it("a refund made on Razorpay is recorded on the session, capped at what was paid", () => {
    expect(decideRefund({ ...base, source: "razorpay", status: "processed", subject: session() })).toEqual({
      action: "record_on_session",
      refundAmountPaise: 49900,
      reason: "Refunded on Razorpay (rfnd_ABC123)",
    });
    expect(
      decideRefund({ ...base, processedTotalPaise: 90000, source: "razorpay", status: "processed", subject: session() })
    ).toMatchObject({ refundAmountPaise: 49900 });
  });

  it("a part refund records the running total; a second event for the same total changes nothing", () => {
    expect(
      decideRefund({ ...base, processedTotalPaise: 20000, source: "razorpay", status: "processed", subject: session() })
    ).toMatchObject({ action: "record_on_session", refundAmountPaise: 20000 });
    expect(
      decideRefund({
        ...base,
        processedTotalPaise: 20000,
        source: "razorpay",
        status: "processed",
        subject: session({ refundStatus: "processed", refundAmountPaise: 20000 }),
      })
    ).toEqual({ action: "nothing", applied: "already" });
  });

  it("a programme, or a payment nothing matches, is left for a person", () => {
    expect(decideRefund({ ...base, source: "razorpay", status: "processed", subject: { kind: "home_visit_purchase", id: "h", patientId: null } }).action).toBe("review");
    expect(decideRefund({ ...base, source: "razorpay", status: "processed", subject: { kind: "none" } }).action).toBe("review");
  });

  it("a refund made on Razorpay that failed changed nobody's money", () => {
    expect(decideRefund({ ...base, source: "razorpay", status: "failed", subject: session() })).toEqual({ action: "nothing", applied: "not_needed" });
  });
});
