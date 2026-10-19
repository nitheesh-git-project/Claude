import { describe, expect, it } from "vitest";
import {
  describeCancellationRefund,
  describeRefund,
  describeRefundPosition,
  refundedPaiseOf,
} from "@/lib/refundState";

const PAID = 199_900; // ₹1,999
const NO_REFUND_DUE = "No refund (cancelled within 24 hours of the slot)";

/** The row as each step of SS1295's history left it. */
const afterFirstPartial = { refund_status: "processed", refund_amount_paise: 20_000 }; // ₹200
const afterSecondPartial = { refund_status: "processed", refund_amount_paise: 30_000 }; // + ₹100
// The cancellation's ₹1,999 refund was refused: the status moves to failed,
// the running total is untouched (cancelAppointmentAndRefund never writes it
// on failure).
const afterFailedCancellation = { refund_status: "failed", refund_amount_paise: 30_000 };

describe("QA F-22: one refund position for SS1295's history", () => {
  it("nets off the processed partial refunds as they happen", () => {
    expect(describeRefundPosition(afterFirstPartial, PAID).refundablePaise).toBe(179_900);
    expect(describeRefundPosition(afterSecondPartial, PAID)).toMatchObject({
      refundedPaise: 30_000,
      refundablePaise: 169_900,
      failed: false,
    });
  });

  it("a failed cancellation refund counts as nothing refunded, and leaves ₹1,699 refundable", () => {
    const position = describeRefundPosition(afterFailedCancellation, PAID);
    expect(position).toEqual({
      state: "failed",
      paidPaise: PAID,
      refundedPaise: 30_000,
      owedBackPaise: 0,
      refundablePaise: 169_900,
      failed: true,
    });
    // The status chip and the cancellation line agree with that figure.
    expect(describeRefund(afterFailedCancellation).label).toBe("Refund failed");
    const line = describeCancellationRefund(position, { noRefundDue: NO_REFUND_DUE });
    expect(line).toBe(
      "₹300 refunded earlier; the refund of the remaining ₹1,699 failed - refund it from this session"
    );
    // The drawer used to print this for a failed refund on a paid session.
    expect(line).not.toContain("No payment to refund");
  });

  it("the partial-refund form's ceiling is paid less processed, not less the failed attempt", () => {
    const position = describeRefundPosition(afterFailedCancellation, PAID);
    const alreadyRefunded = position.paidPaise - position.refundablePaise;
    expect(alreadyRefunded).toBe(30_000);
    expect(position.paidPaise - alreadyRefunded).toBe(169_900);
  });

  it("refunding the remainder closes it: ₹1,999 refunded, nothing left", () => {
    const settled = { refund_status: "processed", refund_amount_paise: PAID };
    const position = describeRefundPosition(settled, PAID);
    expect(position.refundablePaise).toBe(0);
    expect(describeCancellationRefund(position, { noRefundDue: NO_REFUND_DUE })).toBe("₹1,999 refunded");
  });

  it("revenue nets off the ₹300 that went back, before and after the failure", () => {
    expect(refundedPaiseOf(afterSecondPartial)).toBe(30_000);
    expect(refundedPaiseOf(afterFailedCancellation)).toBe(30_000);
  });
});

describe("describeRefundPosition, every state", () => {
  it("a failed refund with no earlier refunds names the whole charge", () => {
    const position = describeRefundPosition({ refund_status: "failed", refund_amount_paise: null }, PAID);
    expect(position.refundablePaise).toBe(PAID);
    expect(describeCancellationRefund(position, { noRefundDue: NO_REFUND_DUE })).toBe(
      "The refund of ₹1,999 failed - refund it from this session"
    );
  });

  it("a forfeiture keeps what earlier refunds returned", () => {
    const position = describeRefundPosition({ refund_status: "not_eligible", refund_amount_paise: 30_000 }, PAID);
    expect(position).toMatchObject({ refundedPaise: 30_000, refundablePaise: 169_900 });
    expect(describeCancellationRefund(position, { noRefundDue: NO_REFUND_DUE })).toBe(
      `${NO_REFUND_DUE}; ₹300 refunded earlier`
    );
    const plain = describeRefundPosition({ refund_status: "not_eligible", refund_amount_paise: 0 }, PAID);
    expect(describeCancellationRefund(plain, { noRefundDue: NO_REFUND_DUE })).toBe(NO_REFUND_DUE);
  });

  it("a hand-back waiting on a person is owed, not refunded, and is not refundable twice", () => {
    const position = describeRefundPosition({ refund_status: "manual_pending", refund_amount_paise: 50_000 }, PAID);
    expect(position).toMatchObject({ refundedPaise: 0, owedBackPaise: 50_000, refundablePaise: 149_900 });
    expect(refundedPaiseOf({ refund_status: "manual_pending", refund_amount_paise: 50_000 })).toBe(0);
    expect(describeCancellationRefund(position, { noRefundDue: NO_REFUND_DUE })).toBe(
      "₹500 to hand back to the patient"
    );
  });

  it("a partly refunded processed session says what was not refunded", () => {
    const position = describeRefundPosition(afterSecondPartial, PAID);
    expect(describeCancellationRefund(position, { noRefundDue: NO_REFUND_DUE })).toBe(
      "₹300 refunded, ₹1,699 not refunded"
    );
  });

  it("no refund at all: an unpaid session, a paid one, a programme session", () => {
    const none = { refund_status: null, refund_amount_paise: null };
    expect(describeCancellationRefund(describeRefundPosition(none, 0), { noRefundDue: NO_REFUND_DUE })).toBe(
      "No payment to refund"
    );
    expect(describeCancellationRefund(describeRefundPosition(none, PAID), { noRefundDue: NO_REFUND_DUE })).toBe(
      "No refund recorded"
    );
    expect(
      describeCancellationRefund(describeRefundPosition(none, PAID), {
        noRefundDue: NO_REFUND_DUE,
        viaProgramme: true,
      })
    ).toBe("Paid via a programme - no card payment to refund");
    expect(describeRefundPosition(none, PAID).refundablePaise).toBe(PAID);
  });

  it("never reports a negative refundable figure", () => {
    expect(
      describeRefundPosition({ refund_status: "processed", refund_amount_paise: PAID + 1 }, PAID).refundablePaise
    ).toBe(0);
  });
});
