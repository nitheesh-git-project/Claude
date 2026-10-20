import { describe, expect, it } from "vitest";
import {
  computeTherapistEarningRows,
  computeTherapistPendingOwed,
  type EarningsAppointment,
} from "./therapistEarnings";
import { computeTherapistPayoutSummary } from "./therapistPayouts";
import { SESSION_FEE_PAISE } from "./pricing";

const NOW = Date.parse("2026-10-19T00:00:00.000Z");
const SHARE = 40;

function session(i: number, over: Partial<EarningsAppointment> = {}): EarningsAppointment {
  return {
    id: `s${i}`,
    patient_id: "p1",
    category_id: null,
    slot_time: new Date(NOW - (i + 1) * 86_400_000).toISOString(),
    status: "completed",
    payment_status: "paid",
    amount_paid_paise: 123_200,
    therapist_payout_paid_at: null,
    ...over,
  };
}

/** What the Earnings screen computed before it went through therapistPayouts:
 *  its own multiplication, falling back to the standard fee for a session
 *  carrying no amount. Kept here only to show the disagreement it produced. */
function oldPending(rows: EarningsAppointment[]): number {
  return rows
    .filter((a) => a.status === "completed" && a.payment_status === "paid" && !a.therapist_payout_paid_at)
    .reduce((sum, a) => sum + Math.round(((a.amount_paid_paise ?? SESSION_FEE_PAISE) * SHARE) / 100), 0);
}

describe("QA F-21: the therapist's pending payout is the admin's owed figure", () => {
  // Fifteen delivered sessions, cash held 0. Nine carry their amount; six are
  // marked paid with no amount recorded. Admin (profile and Payouts) read
  // ₹4,435.20; the therapist's own screen read ₹9,232.80 -- the ₹4,797.60
  // between them is 6 × 40% × ₹1,999, a share of money nobody recorded.
  const fifteen = [
    ...Array.from({ length: 9 }, (_, i) => session(i)),
    ...Array.from({ length: 6 }, (_, i) => session(9 + i, { amount_paid_paise: null })),
  ];

  it("reproduces the two figures the screens disagreed on", () => {
    const admin = computeTherapistPayoutSummary("t1", SHARE, fifteen, NOW);
    expect(admin.completedCount).toBe(15);
    expect(admin.cashHeldPaise).toBe(0);
    expect(admin.owedPaise).toBe(443_520);
    expect(oldPending(fifteen)).toBe(923_280);
    expect(oldPending(fifteen) - admin.owedPaise).toBe(479_760);
  });

  it("the therapist's pending figure, its rows and the admin's owed figure now agree", () => {
    const admin = computeTherapistPayoutSummary("t1", SHARE, fifteen, NOW);
    const pending = computeTherapistPendingOwed("t1", SHARE, fifteen, NOW);
    const rows = computeTherapistEarningRows(fifteen, SHARE, new Map(), new Map());
    expect(pending).toBe(admin.owedPaise);
    expect(rows).toHaveLength(15);
    expect(rows.filter((r) => r.status === "pending").reduce((s, r) => s + r.earningPaise, 0)).toBe(
      admin.owedPaise
    );
    // A row says what it was computed from: no amount, no earning.
    const unrecorded = rows.filter((r) => r.feePaise === 0);
    expect(unrecorded).toHaveLength(6);
    expect(unrecorded.every((r) => r.earningPaise === 0)).toBe(true);
  });
});

describe("the Earnings rows read the payout maths", () => {
  it("a delivered pay-later session is earned at its frozen price", () => {
    const rows = [
      session(1, {
        payment_status: "unpaid",
        payment_terms: "pay_later",
        amount_paid_paise: null,
        amount_due_paise: 100_000,
      }),
    ];
    const pending = computeTherapistPendingOwed("t1", SHARE, rows, NOW);
    expect(pending).toBe(40_000);
    expect(computeTherapistEarningRows(rows, SHARE, new Map(), new Map())[0].earningPaise).toBe(40_000);
  });

  it("a settled session reads back what was transferred, not a recomputation", () => {
    const rows = computeTherapistEarningRows(
      [
        session(1, {
          therapist_payout_paid_at: "2026-10-01T00:00:00.000Z",
          therapist_payout_amount_paise: 50_000,
        }),
      ],
      SHARE,
      new Map(),
      new Map()
    );
    expect(rows[0]).toMatchObject({ status: "paid_out", earningPaise: 50_000 });
  });

  it("a home visit pays the home-visit rate plus travel in full, as on Payouts", () => {
    const rows = [session(1, { visit_mode: "home_visit", amount_paid_paise: 100_000, travel_fee_paise: 15_000 })];
    const admin = computeTherapistPayoutSummary("t1", SHARE, rows, NOW, 70);
    expect(admin.owedPaise).toBe(85_000);
    expect(computeTherapistEarningRows(rows, SHARE, new Map(), new Map(), 70)[0].earningPaise).toBe(85_000);
    expect(computeTherapistPendingOwed("t1", SHARE, rows, NOW, 70)).toBe(85_000);
  });

  it("an upcoming paid session earns nothing yet, and no share set means no rows", () => {
    const upcoming = [session(1, { status: "confirmed" })];
    expect(computeTherapistEarningRows(upcoming, SHARE, new Map(), new Map())).toEqual([]);
    expect(computeTherapistPendingOwed("t1", SHARE, upcoming, NOW)).toBe(0);
    expect(computeTherapistEarningRows([session(1)], null, new Map(), new Map())).toEqual([]);
  });
});
