import { describe, expect, it } from "vitest";
import {
  computeTherapistPayoutSummary,
  sessionTherapistCutPaise,
  type PayoutSummaryInput,
} from "./therapistPayouts";
import { computeTherapistEarningRows, computeTherapistPendingOwed } from "./therapistEarnings";
import { moneyLineFor, type MetricsAppointment } from "./adminMetrics";

// Owner decision on QA F-21's open question: a session pays its therapist at
// the rate frozen onto it at completion (`therapist_share_percent_at_completion`),
// and the live rate only for rows that predate the freeze.

const NOW = Date.parse("2026-10-19T00:00:00.000Z");
const SLOT = "2026-10-01T10:00:00.000Z";

function delivered(over: Partial<PayoutSummaryInput & { id: string }> = {}) {
  return {
    id: "a1",
    patient_id: "p1",
    category_id: null,
    status: "completed",
    payment_status: "paid",
    amount_paid_paise: 100_000,
    slot_time: SLOT,
    therapist_payout_paid_at: null,
    therapist_payout_amount_paise: null,
    visit_mode: "online",
    ...over,
  };
}

describe("a therapist's cut uses the rate frozen at completion", () => {
  it("uses the frozen rate when one is set", () => {
    expect(sessionTherapistCutPaise(delivered({ therapist_share_percent_at_completion: 40 }), 60, null)).toBe(40_000);
  });

  it("a frozen 0% is a rate, not a missing one", () => {
    expect(sessionTherapistCutPaise(delivered({ therapist_share_percent_at_completion: 0 }), 60, null)).toBe(0);
  });

  it("falls back to the live rate where nothing was frozen (older rows)", () => {
    expect(sessionTherapistCutPaise(delivered({ therapist_share_percent_at_completion: null }), 60, null)).toBe(60_000);
    expect(sessionTherapistCutPaise(delivered(), 60, null)).toBe(60_000);
  });

  it("a frozen home-visit rate is not re-resolved against the live home-visit rate; travel stays on top", () => {
    const visit = delivered({
      visit_mode: "home_visit",
      travel_fee_paise: 15_000,
      therapist_share_percent_at_completion: 50,
    });
    expect(sessionTherapistCutPaise(visit, 40, 70)).toBe(50_000 + 15_000);
  });

  it("a rate change after completion does not change an unsettled session's cut, on any screen", () => {
    // Delivered at 40%, frozen; the therapist is renegotiated to 60% afterwards.
    const rows = [delivered({ therapist_share_percent_at_completion: 40 })];
    const before = computeTherapistPayoutSummary("t1", 40, rows, NOW);
    const after = computeTherapistPayoutSummary("t1", 60, rows, NOW);
    expect(before.owedPaise).toBe(40_000);
    expect(after.owedPaise).toBe(40_000);
    // The therapist's own screen reads the same figure.
    expect(computeTherapistPendingOwed("t1", 60, rows, NOW)).toBe(40_000);
    expect(computeTherapistEarningRows(rows, 60, new Map(), new Map())[0].earningPaise).toBe(40_000);
    // ...and so does Money's split, which already froze it.
    const line = moneyLineFor(
      { ...rows[0], therapist_id: "t1", no_show: false, refund_status: null, refund_amount_paise: null } as unknown as MetricsAppointment,
      { therapistSharePercent: { t1: 60 }, patientHospitalSharePercent: {}, hospitalReferredPatientIds: {} }
    );
    expect(line?.therapistCutPaise).toBe(40_000);
  });

  it("a settled session still reads back what was transferred", () => {
    const settled = delivered({
      therapist_share_percent_at_completion: 40,
      therapist_payout_paid_at: "2026-10-05T00:00:00.000Z",
      therapist_payout_amount_paise: 35_000,
    });
    expect(sessionTherapistCutPaise(settled, 60, null)).toBe(35_000);
  });
});
