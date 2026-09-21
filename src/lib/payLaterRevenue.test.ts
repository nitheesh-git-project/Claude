// Pay later's effect on the books, kept in its own file so the existing
// money tests stay byte-for-byte untouched -- which is itself the proof that
// the change is inert on every session that predates it.
import { describe, it, expect } from "vitest";
import { moneyLineFor, type MetricsAppointment, type MoneyRates } from "./adminMetrics";
import { computeTherapistPayoutSummary, type PayoutAppointment } from "./therapistPayouts";
import { computeTherapistEarningRows, type EarningsAppointment } from "./therapistEarnings";

const SLOT = "2026-01-15T10:00:00.000Z";
const THERAPIST = "t1";
const NOW = Date.parse("2026-03-01T00:00:00.000Z");

const RATES: MoneyRates = {
  therapistSharePercent: { [THERAPIST]: 60 },
  patientHospitalSharePercent: {},
  hospitalReferredPatientIds: {},
};

function metricsRow(over: Partial<MetricsAppointment> = {}): MetricsAppointment {
  return {
    id: "a1",
    status: "completed",
    payment_status: "paid",
    amount_paid_paise: 120000,
    category_id: null,
    therapist_id: THERAPIST,
    patient_id: "p1",
    created_at: SLOT,
    paid_at: SLOT,
    slot_time: SLOT,
    no_show: false,
    refund_status: null,
    refund_amount_paise: null,
    concern: null,
    razorpay_payment_id: null,
    therapist_payout_paid_at: null,
    therapist_payout_amount_paise: null,
    therapist_payout_method: null,
    therapist_payout_note: null,
    patient_rating: null,
    patient_feedback: null,
    therapist_rating: null,
    therapist_feedback: null,
    ...over,
  };
}

/** A delivered pay-later session: no money in, a frozen price on the row. */
function payLaterRow(over: Partial<MetricsAppointment> = {}): MetricsAppointment {
  return metricsRow({
    payment_status: "unpaid",
    payment_terms: "pay_later",
    amount_paid_paise: null,
    amount_due_paise: 120000,
    paid_at: null,
    ...over,
  });
}

describe("revenue is recognised when the session is delivered", () => {
  it("counts a completed pay-later session at its frozen price", () => {
    const line = moneyLineFor(payLaterRow(), RATES);
    expect(line).not.toBeNull();
    expect(line!.paidPaise).toBe(120000);
    expect(line!.netPaise).toBe(120000);
  });

  // The whole point of freezing: the figure must read the same either side of
  // a payment, or settling an old tab would move a closed month's revenue.
  it("reads the same figure once the patient settles", () => {
    const before = moneyLineFor(payLaterRow(), RATES)!;
    const after = moneyLineFor(
      payLaterRow({ payment_status: "paid", amount_paid_paise: 120000, paid_at: SLOT }),
      RATES
    )!;
    expect(after.paidPaise).toBe(before.paidPaise);
    expect(after.netPaise).toBe(before.netPaise);
    expect(after.therapistCutPaise).toBe(before.therapistCutPaise);
    expect(after.clinicSharePaise).toBe(before.clinicSharePaise);
  });

  // Nothing is owed and nothing is earned until the work is done.
  it("counts nothing for a pay-later session that has only been booked", () => {
    expect(moneyLineFor(payLaterRow({ status: "confirmed" }), RATES)).toBeNull();
    expect(moneyLineFor(payLaterRow({ status: "requested" }), RATES)).toBeNull();
  });

  it("counts nothing for a cancelled pay-later session", () => {
    expect(moneyLineFor(payLaterRow({ status: "cancelled" }), RATES)).toBeNull();
  });

  // The change must be invisible to every row that is not pay-later.
  it("still ignores an abandoned prepaid checkout", () => {
    expect(moneyLineFor(metricsRow({ payment_status: "unpaid" }), RATES)).toBeNull();
    expect(
      moneyLineFor(metricsRow({ payment_status: "unpaid", status: "completed" }), RATES)
    ).toBeNull();
  });

  it("uses the session's own price rather than the standard fee", () => {
    const line = moneyLineFor(payLaterRow({ amount_due_paise: 150000 }), RATES)!;
    expect(line.paidPaise).toBe(150000);
  });

  it("gives the therapist their share of the delivered session", () => {
    const line = moneyLineFor(payLaterRow(), RATES)!;
    expect(line.therapistCutPaise).toBe(72000);
    expect(line.clinicSharePaise).toBe(48000);
  });

  // January must not show a loss for a session that made a profit.
  it("keeps revenue and the therapist's share in the same month", () => {
    const line = moneyLineFor(payLaterRow(), RATES)!;
    expect(line.netPaise - line.therapistCutPaise - line.hospitalCutPaise).toBe(
      line.clinicSharePaise
    );
    expect(line.clinicSharePaise).toBeGreaterThan(0);
  });
});

function payoutRow(over: Partial<PayoutAppointment> = {}): PayoutAppointment {
  return {
    id: "a1",
    therapist_id: THERAPIST,
    status: "completed",
    payment_status: "paid",
    amount_paid_paise: 120000,
    slot_time: SLOT,
    therapist_payout_paid_at: null,
    therapist_payout_amount_paise: null,
    ...over,
  } as PayoutAppointment;
}

describe("the therapist is paid for delivering, not for collecting", () => {
  it("owes the share on a delivered pay-later session", () => {
    const summary = computeTherapistPayoutSummary(THERAPIST, 60, [
      payoutRow({
        payment_status: "unpaid",
        payment_terms: "pay_later",
        amount_paid_paise: null,
        amount_due_paise: 120000,
      }),
    ], NOW);
    expect(summary.owedPaise).toBe(72000);
  });

  // THE TRAP THIS FILE EXISTS FOR. The three readers of a session's amount do
  // not share a fallback -- this one falls back to 0 and must keep doing so.
  // A shared helper hard-coding the session fee would start paying a share on
  // already-paid sessions carrying no amount, which pay nothing today.
  it("still contributes nothing for a paid session with no recorded amount", () => {
    const summary = computeTherapistPayoutSummary(
      THERAPIST,
      60,
      [payoutRow({ amount_paid_paise: null })],
      NOW
    );
    expect(summary.owedPaise).toBe(0);
    expect(summary.revenuePaise).toBe(0);
  });

  it("does not pay for a pay-later session that was only booked", () => {
    const summary = computeTherapistPayoutSummary(THERAPIST, 60, [
      payoutRow({
        status: "confirmed",
        payment_status: "unpaid",
        payment_terms: "pay_later",
        amount_paid_paise: null,
        amount_due_paise: 120000,
      }),
    ], NOW);
    expect(summary.owedPaise).toBe(0);
  });

  it("does not change what is owed once the patient settles", () => {
    const unpaid = computeTherapistPayoutSummary(THERAPIST, 60, [
      payoutRow({
        payment_status: "unpaid",
        payment_terms: "pay_later",
        amount_paid_paise: null,
        amount_due_paise: 120000,
      }),
    ], NOW);
    const settled = computeTherapistPayoutSummary(THERAPIST, 60, [
      payoutRow({
        payment_terms: "pay_later",
        amount_paid_paise: 120000,
        amount_due_paise: 120000,
      }),
    ], NOW);
    expect(settled.owedPaise).toBe(unpaid.owedPaise);
  });

  it("leaves an abandoned prepaid checkout out of the payout", () => {
    const summary = computeTherapistPayoutSummary(
      THERAPIST,
      60,
      [payoutRow({ payment_status: "unpaid" })],
      NOW
    );
    expect(summary.owedPaise).toBe(0);
  });
});

function earningsRow(over: Partial<EarningsAppointment> = {}): EarningsAppointment {
  return {
    id: "a1",
    patient_id: "p1",
    category_id: null,
    slot_time: SLOT,
    status: "completed",
    payment_status: "paid",
    amount_paid_paise: 120000,
    therapist_payout_paid_at: null,
    ...over,
  };
}

describe("the therapist's own Earnings screen", () => {
  it("lists a delivered pay-later session as pending", () => {
    const rows = computeTherapistEarningRows(
      [
        earningsRow({
          payment_status: "unpaid",
          payment_terms: "pay_later",
          amount_paid_paise: null,
          amount_due_paise: 120000,
        }),
      ],
      60,
      new Map(),
      new Map(),
      199900
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].earningPaise).toBe(72000);
    expect(rows[0].status).toBe("pending");
  });

  // This module's fallback is a passed-in value, and it must stay that way.
  it("still falls back to the caller's own figure for a paid session", () => {
    const rows = computeTherapistEarningRows(
      [earningsRow({ amount_paid_paise: null })],
      60,
      new Map(),
      new Map(),
      199900
    );
    expect(rows[0].feePaise).toBe(199900);
  });

  it("does not list a pay-later session that has not happened", () => {
    const rows = computeTherapistEarningRows(
      [
        earningsRow({
          status: "confirmed",
          payment_status: "unpaid",
          payment_terms: "pay_later",
          amount_paid_paise: null,
          amount_due_paise: 120000,
        }),
      ],
      60,
      new Map(),
      new Map(),
      199900
    );
    expect(rows).toEqual([]);
  });
});
