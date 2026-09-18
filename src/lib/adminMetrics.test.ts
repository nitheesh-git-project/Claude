import { describe, expect, it } from "vitest";

import {
  computeCancellationRate,
  computeNoShowRate,
  comparePeriod,
  computeRepeatBookingRate,
  explainMoneyLines,
  moneyByBucketFor,
  previousRange,
  type MetricsAppointment,
  type PeriodBucket,
} from "@/lib/adminMetrics";

/**
 * The revenue split, pinned.
 *
 * `moneyByBucketFor` is the only place this clinic's money is divided up,
 * and it feeds the Money summary strip, the tiles and the breakdown chart
 * from one pass -- which is exactly why it needed a test more than anything
 * else in src/lib and had none. A defect here is wrong on three screens at
 * once and wrong in the same direction, so the screens cannot catch it by
 * disagreeing with each other.
 *
 * Its own comments record four misstatements it has already been corrected
 * for. Each one gets a test below, named for the mistake rather than for
 * the function, because the point is that they stay fixed:
 *
 *   1. a therapist's cut counted on booking rather than on delivery
 *   2. a home visit's travel fee falling into the clinic's share
 *   3. refunds taken off a margin that had already had a cut deducted
 *   4. "no hospital" and "hospital share not configured" collapsed together
 *
 * The dataset mirrors the reference dataset in docs/qa (§16.1 of the manual
 * test plan), so the figures a tester re-derives by hand on the Money
 * screens and the figures asserted here are the same figures.
 */

const BUCKET: PeriodBucket = {
  label: "September 2026",
  startMs: Date.UTC(2026, 8, 1),
  endMs: Date.UTC(2026, 9, 1),
};

const IN_RANGE = new Date(Date.UTC(2026, 8, 15, 10, 0)).toISOString();

const THERAPIST_A = "therapist-a";
const THERAPIST_NO_SHARE = "therapist-no-share";
const PATIENT_PLAIN = "patient-plain";
const PATIENT_REFERRED = "patient-referred";
const PATIENT_REFERRED_UNCONFIGURED = "patient-referred-unconfigured";

function appointment(over: Partial<MetricsAppointment> = {}): MetricsAppointment {
  return {
    id: "a1",
    status: "completed",
    payment_status: "paid",
    amount_paid_paise: 199900,
    category_id: null,
    therapist_id: THERAPIST_A,
    patient_id: PATIENT_PLAIN,
    created_at: IN_RANGE,
    paid_at: IN_RANGE,
    slot_time: IN_RANGE,
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

/** 60% online, 65% on home visits -- the fixtures from the test plan. */
const SHARES = { [THERAPIST_A]: 60 };
const HOME_SHARES = { [THERAPIST_A]: 65 };
/** Hospital A takes 10%. */
const HOSPITAL_SHARES = { [PATIENT_REFERRED]: 10 };
const REFERRED = {
  [PATIENT_REFERRED]: true as const,
  [PATIENT_REFERRED_UNCONFIGURED]: true as const,
};

function run(appointments: MetricsAppointment[]) {
  const money = moneyByBucketFor(
    appointments,
    [BUCKET],
    SHARES,
    HOSPITAL_SHARES,
    REFERRED,
    HOME_SHARES
  );
  return {
    gross: money.grossRevenuePaise[0],
    refunds: money.refundedPaise[0],
    net: money.netRevenuePaise[0],
    splittable: money.splittableNetPaise[0],
    therapist: money.therapistCutPaise[0],
    hospital: money.hospitalCutPaise[0],
    clinic: money.clinicSharePaise[0],
    excludedCount: money.excludedCount,
    excludedRevenue: money.excludedRevenuePaise,
  };
}

describe("moneyByBucketFor - the two identities", () => {
  it("holds net = gross - refunds, and clinic = splittable - therapist - hospital", () => {
    const r = run([
      appointment({ id: "s1" }),
      appointment({ id: "s2", status: "confirmed", amount_paid_paise: 179900 }),
      appointment({
        id: "s3",
        status: "cancelled",
        refund_status: "processed",
        refund_amount_paise: 199900,
      }),
      appointment({ id: "s4", patient_id: PATIENT_REFERRED, amount_paid_paise: 249900 }),
    ]);

    expect(r.net).toBe(r.gross - r.refunds);
    expect(r.clinic).toBe(r.splittable - r.therapist - r.hospital);
  });

  it("holds both identities on an empty range rather than dividing by nothing", () => {
    const r = run([]);
    expect(r).toMatchObject({
      gross: 0,
      refunds: 0,
      net: 0,
      splittable: 0,
      therapist: 0,
      hospital: 0,
      clinic: 0,
      excludedCount: 0,
    });
  });
});

describe("moneyByBucketFor - correction 1: a share is earned by delivering", () => {
  it("counts a completed paid session toward the therapist's cut", () => {
    const r = run([appointment({ id: "s1" })]);
    // 199900 * 60%
    expect(r.therapist).toBe(119940);
    expect(r.clinic).toBe(199900 - 119940);
  });

  it("counts a paid session that was never delivered toward revenue but not the cut", () => {
    const r = run([appointment({ id: "s2", status: "confirmed" })]);
    expect(r.gross).toBe(199900);
    expect(r.splittable).toBe(199900);
    // The bug this replaced deducted a share nobody would ever be paid,
    // which understated the clinic's take on every forfeited late
    // cancellation.
    expect(r.therapist).toBe(0);
    expect(r.clinic).toBe(199900);
  });

  it("counts a cancelled-and-refunded session toward neither the cut nor net", () => {
    const r = run([
      appointment({
        id: "s3",
        status: "cancelled",
        refund_status: "processed",
        refund_amount_paise: 199900,
      }),
    ]);
    expect(r.gross).toBe(199900);
    expect(r.refunds).toBe(199900);
    expect(r.net).toBe(0);
    expect(r.therapist).toBe(0);
    expect(r.clinic).toBe(0);
  });

  it("ignores a refund that has not processed", () => {
    const r = run([
      appointment({ id: "s3b", refund_status: "pending", refund_amount_paise: 199900 }),
    ]);
    expect(r.refunds).toBe(0);
    expect(r.net).toBe(199900);
  });
});

describe("moneyByBucketFor - correction 2: travel is the therapist's, never revenue", () => {
  it("adds a home visit's travel fee to the cut without adding it to gross", () => {
    const r = run([
      appointment({
        id: "s6",
        visit_mode: "home_visit",
        amount_paid_paise: 249900,
        travel_fee_paise: 15000,
      }),
    ]);
    // Gross is the fee alone -- travel is a reimbursement passed through.
    expect(r.gross).toBe(249900);
    // 249900 * 65% (the home-visit rate) + 15000 travel, in full.
    expect(r.therapist).toBe(Math.round((249900 * 65) / 100) + 15000);
    // Omitting the travel fee here -- the bug -- overstated the clinic's
    // share by the whole travel bill on every visit.
    expect(r.clinic).toBe(249900 - r.therapist);
  });

  it("falls back to the online share when a therapist has no home-visit rate", () => {
    const money = moneyByBucketFor(
      [
        appointment({
          id: "s6b",
          visit_mode: "home_visit",
          amount_paid_paise: 249900,
          travel_fee_paise: 15000,
        }),
      ],
      [BUCKET],
      SHARES,
      HOSPITAL_SHARES,
      REFERRED,
      {} // no home-visit rate configured for anyone
    );
    expect(money.therapistCutPaise[0]).toBe(Math.round((249900 * 60) / 100) + 15000);
  });

  it("treats a missing or negative travel fee as zero rather than as a credit", () => {
    const r = run([
      appointment({ id: "s6c", visit_mode: "home_visit", travel_fee_paise: -5000 }),
    ]);
    expect(r.therapist).toBe(Math.round((199900 * 65) / 100));
  });
});

describe("moneyByBucketFor - correction 3: refunds reverse the partner, not the therapist", () => {
  it("takes the partner's commission on net, so a refund reverses it", () => {
    const delivered = run([
      appointment({ id: "s4", patient_id: PATIENT_REFERRED, amount_paid_paise: 249900 }),
    ]);
    expect(delivered.hospital).toBe(Math.round((249900 * 10) / 100));

    const refunded = run([
      appointment({
        id: "s4b",
        patient_id: PATIENT_REFERRED,
        amount_paid_paise: 249900,
        status: "cancelled",
        refund_status: "processed",
        refund_amount_paise: 249900,
      }),
    ]);
    // Net is nil, so the commission is nil -- a cut of money kept.
    expect(refunded.hospital).toBe(0);
    // And the therapist's cut was never taken, because it was cancelled.
    expect(refunded.therapist).toBe(0);
  });

  it("gives a patient with no hospital a zero cut while keeping them in the split", () => {
    const r = run([appointment({ id: "s1", patient_id: PATIENT_PLAIN })]);
    expect(r.hospital).toBe(0);
    expect(r.excludedCount).toBe(0);
    expect(r.splittable).toBe(199900);
  });
});

describe("moneyByBucketFor - correction 4: unknowable is excluded, never guessed", () => {
  it("excludes a session whose therapist has no revenue share set", () => {
    const r = run([appointment({ id: "s5", therapist_id: THERAPIST_NO_SHARE })]);
    // Money is money: revenue still counts it.
    expect(r.gross).toBe(199900);
    expect(r.net).toBe(199900);
    // The split does not.
    expect(r.splittable).toBe(0);
    expect(r.therapist).toBe(0);
    expect(r.hospital).toBe(0);
    expect(r.clinic).toBe(0);
    expect(r.excludedCount).toBe(1);
    expect(r.excludedRevenue).toBe(199900);
  });

  it("excludes a hospital-referred patient whose hospital has no share configured", () => {
    const r = run([
      appointment({ id: "s5b", patient_id: PATIENT_REFERRED_UNCONFIGURED }),
    ]);
    expect(r.gross).toBe(199900);
    expect(r.excludedCount).toBe(1);
    expect(r.splittable).toBe(0);
  });

  it("keeps 'not referred at all' and 'referred but unconfigured' apart", () => {
    const notReferred = run([appointment({ id: "p1", patient_id: PATIENT_PLAIN })]);
    const referredUnconfigured = run([
      appointment({ id: "p2", patient_id: PATIENT_REFERRED_UNCONFIGURED }),
    ]);
    // Same money, opposite treatment -- collapsing these was the bug.
    expect(notReferred.gross).toBe(referredUnconfigured.gross);
    expect(notReferred.excludedCount).toBe(0);
    expect(referredUnconfigured.excludedCount).toBe(1);
  });
});

describe("moneyByBucketFor - what falls outside the range or the rules", () => {
  it("ignores an unpaid session entirely", () => {
    const r = run([appointment({ id: "u1", payment_status: "unpaid" })]);
    expect(r).toMatchObject({ gross: 0, net: 0, excludedCount: 0 });
  });

  it("ignores a session with no slot time, since it lands in no bucket", () => {
    const r = run([appointment({ id: "u2", slot_time: null })]);
    expect(r.gross).toBe(0);
  });

  it("ignores a session whose slot falls outside every bucket", () => {
    const r = run([
      appointment({ id: "u3", slot_time: new Date(Date.UTC(2026, 7, 15)).toISOString() }),
    ]);
    expect(r.gross).toBe(0);
  });

  it("buckets by slot time, not by when the money was taken", () => {
    const money = moneyByBucketFor(
      [
        appointment({
          id: "b1",
          slot_time: new Date(Date.UTC(2026, 8, 2)).toISOString(),
          paid_at: new Date(Date.UTC(2026, 7, 20)).toISOString(),
        }),
      ],
      [
        { label: "Aug", startMs: Date.UTC(2026, 7, 1), endMs: Date.UTC(2026, 8, 1) },
        BUCKET,
      ],
      SHARES,
      HOSPITAL_SHARES,
      REFERRED,
      HOME_SHARES
    );
    expect(money.grossRevenuePaise[0]).toBe(0);
    expect(money.grossRevenuePaise[1]).toBe(199900);
  });
});

describe("moneyByBucketFor - the whole reference dataset", () => {
  // The seven rows from §16.1 of the manual test plan, so the figures a
  // tester checks by hand against the Money screens are pinned here too.
  const dataset: MetricsAppointment[] = [
    appointment({ id: "S1" }),
    appointment({ id: "S2", status: "confirmed", amount_paid_paise: 179900 }),
    appointment({
      id: "S3",
      status: "cancelled",
      refund_status: "processed",
      refund_amount_paise: 199900,
    }),
    appointment({ id: "S4", patient_id: PATIENT_REFERRED, amount_paid_paise: 249900 }),
    appointment({
      id: "S5",
      patient_id: PATIENT_REFERRED,
      therapist_id: THERAPIST_NO_SHARE,
    }),
    appointment({
      id: "S6",
      visit_mode: "home_visit",
      amount_paid_paise: 249900,
      travel_fee_paise: 15000,
    }),
    appointment({
      id: "S7",
      visit_mode: "home_visit",
      amount_paid_paise: 249900,
      travel_fee_paise: 15000,
      payment_method: "cash",
    }),
  ];

  it("produces the figures the test plan asks a tester to re-derive", () => {
    const r = run(dataset);

    expect(r.gross).toBe(199900 + 179900 + 199900 + 249900 + 199900 + 249900 + 249900);
    expect(r.refunds).toBe(199900);
    expect(r.net).toBe(r.gross - r.refunds);

    // S5 alone is unknowable: its therapist has no share.
    expect(r.excludedCount).toBe(1);
    expect(r.excludedRevenue).toBe(199900);
    expect(r.splittable).toBe(r.net - 199900);

    const online = Math.round((199900 * 60) / 100) + Math.round((249900 * 60) / 100);
    const homeVisits = 2 * (Math.round((249900 * 65) / 100) + 15000);
    expect(r.therapist).toBe(online + homeVisits);

    // Only S4 is referred *and* configured. S5 is excluded outright.
    expect(r.hospital).toBe(Math.round((249900 * 10) / 100));

    expect(r.clinic).toBe(r.splittable - r.therapist - r.hospital);
    // Both identities, once more, over the whole set.
    expect(r.net).toBe(r.gross - r.refunds);
  });
});

describe("the operational rates that sit beside the split", () => {
  it("computes a no-show rate over completed sessions only", () => {
    const rate = computeNoShowRate([
      { no_show: true },
      { no_show: false },
      { no_show: false },
      { no_show: false },
    ]);
    expect(rate).toMatchObject({ noShowCount: 1, completedCount: 4 });
    // Percentages, not fractions -- these figures are printed as "25%".
    expect(rate.rate).toBeCloseTo(25, 5);
  });

  it("returns a null no-show rate rather than zero when nothing completed", () => {
    expect(computeNoShowRate([]).rate).toBeNull();
  });

  it("computes a cancellation rate over sessions that actually resolved", () => {
    const rate = computeCancellationRate([
      { status: "cancelled", refund_status: "processed" },
      { status: "completed", refund_status: null },
      { status: "completed", refund_status: null },
      // Still in the future, so it has resolved into neither -- counting it
      // would let picking a "To" date in the future dilute the rate.
      { status: "confirmed", refund_status: null },
    ]);
    expect(rate.rate).toBeCloseTo(100 / 3, 5);
  });

  it("returns a null repeat-booking rate when there is nobody to repeat", () => {
    expect(computeRepeatBookingRate([])).toBeNull();
  });

  it("counts a patient with more than one session as a repeat", () => {
    const rate = computeRepeatBookingRate([
      appointment({ id: "r1", patient_id: "p-repeat" }),
      appointment({ id: "r2", patient_id: "p-repeat" }),
      appointment({ id: "r3", patient_id: "p-once" }),
    ]);
    expect(rate).toBeCloseTo(50, 5);
  });
});

/**
 * The drill-down and the total it sits under.
 *
 * `explainMoneyLines` is what the (i)-style "see the sessions behind this"
 * modal lists. It is derived from `moneyLineFor`, which `moneyByBucketFor`
 * itself calls -- so these tests exist to keep that true: a drill-down that
 * can disagree with its own total is worse than no drill-down at all,
 * because it makes a correct figure look wrong.
 */
describe("explainMoneyLines", () => {
  const RATES = {
    therapistSharePercent: SHARES,
    patientHospitalSharePercent: HOSPITAL_SHARES,
    hospitalReferredPatientIds: REFERRED,
    therapistHomeVisitSharePercent: HOME_SHARES,
  };

  const SET: MetricsAppointment[] = [
    appointment({ id: "s1" }),
    appointment({ id: "s2", status: "confirmed" }),
    appointment({
      id: "s3",
      refund_status: "processed",
      refund_amount_paise: 199900,
      status: "cancelled",
    }),
    appointment({ id: "s4", patient_id: PATIENT_REFERRED }),
    appointment({ id: "s5", therapist_id: THERAPIST_NO_SHARE }),
    appointment({
      id: "s6",
      visit_mode: "home_visit",
      travel_fee_paise: 15000,
    } as Partial<MetricsAppointment>),
    // Neither of these contributes to any figure, so neither may be listed.
    appointment({ id: "s7", payment_status: "unpaid" }),
    appointment({ id: "s8", slot_time: new Date(Date.UTC(2026, 6, 2)).toISOString() }),
  ];

  it("lists exactly the sessions the totals counted", () => {
    const ids = explainMoneyLines(SET, [BUCKET], RATES).map((l) => l.appointmentId);
    expect(ids).not.toContain("s7");
    expect(ids).not.toContain("s8");
    expect(ids).toHaveLength(6);
  });

  it("adds up to the figures on the cards, to the rupee", () => {
    const lines = explainMoneyLines(SET, [BUCKET], RATES);
    const totals = run(SET);
    const sum = (pick: (l: (typeof lines)[number]) => number) =>
      lines.reduce((acc, l) => acc + pick(l), 0);

    expect(sum((l) => l.paidPaise)).toBe(totals.gross);
    expect(sum((l) => l.refundPaise)).toBe(totals.refunds);
    expect(sum((l) => l.therapistCutPaise)).toBe(totals.therapist);
    expect(sum((l) => l.hospitalCutPaise)).toBe(totals.hospital);
    expect(sum((l) => l.clinicSharePaise)).toBe(totals.clinic);
    expect(sum((l) => (l.excluded ? 0 : l.netPaise))).toBe(totals.splittable);
  });

  // The card names how many sessions are left out of the split; the list
  // has to be able to show which, or the note is unactionable.
  it("marks the sessions left out of the split, and zeroes their cuts", () => {
    const lines = explainMoneyLines(SET, [BUCKET], RATES);
    const excluded = lines.filter((l) => l.excluded);
    expect(excluded.map((l) => l.appointmentId)).toEqual(["s5"]);
    expect(excluded[0].paidPaise).toBeGreaterThan(0);
    expect(excluded[0].therapistCutPaise).toBe(0);
    expect(excluded[0].clinicSharePaise).toBe(0);
  });

  it("keeps a booked-but-undelivered session out of the therapist's cut", () => {
    const line = explainMoneyLines(SET, [BUCKET], RATES).find((l) => l.appointmentId === "s2")!;
    expect(line.paidPaise).toBeGreaterThan(0);
    expect(line.therapistCutPaise).toBe(0);
  });

  it("puts a home visit's travel fee in the therapist's cut, at the home rate", () => {
    const line = explainMoneyLines(SET, [BUCKET], RATES).find((l) => l.appointmentId === "s6")!;
    expect(line.therapistCutPaise).toBe(Math.round((199900 * 65) / 100) + 15000);
  });

  it("is newest first, so the list opens on what just happened", () => {
    const lines = explainMoneyLines(
      [
        appointment({ id: "old", slot_time: new Date(Date.UTC(2026, 8, 2)).toISOString() }),
        appointment({ id: "new", slot_time: new Date(Date.UTC(2026, 8, 20)).toISOString() }),
      ],
      [BUCKET],
      RATES
    );
    expect(lines.map((l) => l.appointmentId)).toEqual(["new", "old"]);
  });
});

describe("comparePeriod", () => {
  it("compares against the same length of time immediately before", () => {
    const range = previousRange(Date.UTC(2026, 8, 1), Date.UTC(2026, 9, 1));
    expect(range.toMs).toBe(Date.UTC(2026, 8, 1));
    expect(range.toMs - range.fromMs).toBe(Date.UTC(2026, 9, 1) - Date.UTC(2026, 8, 1));
  });

  it("says which way and by how much, in words", () => {
    expect(comparePeriod(120000, 100000, "30 days").label).toBe("20% more than the 30 days before");
    expect(comparePeriod(80000, 100000, "30 days").label).toBe("20% less than the 30 days before");
    expect(comparePeriod(120000, 100000, "30 days").direction).toBe("up");
    expect(comparePeriod(80000, 100000, "30 days").direction).toBe("down");
  });

  // A percentage against nothing is not a percentage, and "+100%" or "∞" is
  // worse than saying there is no comparison to make.
  it("refuses to invent a percentage from a zero baseline", () => {
    const change = comparePeriod(50000, 0, "week");
    expect(change.percent).toBeNull();
    expect(change.label).toBe("Nothing in the week before");
    expect(comparePeriod(0, 0, "week").direction).toBe("flat");
  });

  // An arrow over noise is an arrow an owner stops reading.
  it("calls a fraction of a percent level rather than a move", () => {
    expect(comparePeriod(100200, 100000, "month").direction).toBe("flat");
    expect(comparePeriod(100200, 100000, "month").label).toBe("Level with the month before");
  });

  it("keeps one decimal for a small move and drops it for a big one", () => {
    expect(comparePeriod(101500, 100000, "month").label).toBe("1.5% more than the month before");
    expect(comparePeriod(212000, 100000, "month").label).toBe("112% more than the month before");
  });

  it("handles a fall to nothing without dividing by zero", () => {
    const change = comparePeriod(0, 100000, "month");
    expect(change.percent).toBe(-100);
    expect(change.label).toBe("100% less than the month before");
  });
});
