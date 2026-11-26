import { describe, it, expect } from "vitest";
import {
  buildPatientTransactions,
  computePatientPaymentSummary,
  type PaymentAppointment,
  type SettlementPayment,
} from "./paymentHistory";

function session(over: Partial<PaymentAppointment>): PaymentAppointment {
  return {
    id: "a1",
    patient_id: "p1",
    therapist_id: "t1",
    concern: "Knee pain",
    payment_status: "unpaid",
    amount_paid_paise: null,
    paid_at: null,
    razorpay_payment_id: null,
    package_purchase_id: null,
    therapist_payout_paid_at: null,
    therapist_payout_amount_paise: null,
    therapist_payout_method: null,
    therapist_payout_note: null,
    status: "confirmed",
    slot_time: "2026-11-28T09:30:00.000Z",
    timezone: "Asia/Kolkata",
    refund_status: null,
    therapist_payout_batch_id: null,
    ...over,
  };
}

const payment: SettlementPayment = {
  id: "plp1",
  amount_paise: 49_900,
  method: "upi",
  reference: "UTR123456789012",
  confirmed_at: "2026-11-26T10:00:00.000Z",
  declared_at: "2026-11-26T09:00:00.000Z",
};

describe("Money in from a patient", () => {
  it("counts a confirmed pay-later payment the day it is confirmed, before any session uses it", () => {
    const tx = buildPatientTransactions([session({})], [], new Map(), [payment]);
    expect(tx).toHaveLength(1);
    expect(tx[0]).toMatchObject({
      id: "plp1",
      date: "2026-11-26T10:00:00.000Z",
      amountPaise: 49_900,
      modeOfPayment: "UPI",
      transactionId: "UTR123456789012",
    });
    expect(computePatientPaymentSummary("p1", tx).totalSpentPaise).toBe(49_900);
  });

  it("does not count a session a payment closed a second time", () => {
    const settled = session({
      payment_status: "paid",
      amount_paid_paise: 49_900,
      paid_at: "2026-11-28T11:00:00.000Z",
      status: "completed",
      pay_later_payment_id: "plp1",
    });
    const tx = buildPatientTransactions([settled], [], new Map(), [payment]);
    expect(computePatientPaymentSummary("p1", tx).totalSpentPaise).toBe(49_900);
  });

  it("still counts an ordinary paid session", () => {
    const paid = session({ id: "a2", payment_status: "paid", amount_paid_paise: 49_900, paid_at: "2026-11-25T10:00:00.000Z" });
    const tx = buildPatientTransactions([paid], [], new Map(), [payment]);
    expect(computePatientPaymentSummary("p1", tx).totalSpentPaise).toBe(99_800);
  });

  it("behaves as before when no payments are passed", () => {
    const settled = session({ payment_status: "paid", amount_paid_paise: 49_900, paid_at: "2026-11-28T11:00:00.000Z", pay_later_payment_id: "plp1" });
    expect(buildPatientTransactions([settled], [], new Map())).toHaveLength(1);
  });
});
