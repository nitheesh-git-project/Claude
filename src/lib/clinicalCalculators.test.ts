import { describe, expect, it } from "vitest";
import {
  CHAIR_STAND_NORMS,
  SIX_MINUTE_WALK_EQUATIONS,
  averageOfTrials,
  bestOfTrials,
  chairStandNorm,
  correctedAgeMonths,
  daysBetween,
  extensionLag,
  isChairStandBelowAverage,
  limbSymmetryIndex,
  medianOfTrials,
  orthostaticDrop,
  percentOfPredicted,
  predictedSixMinuteWalk,
  roundTo,
  scoreSheetMax,
  scoreSheetTotal,
  steadiFallRisk,
  steadiTestFindings,
  trainingHeartRate,
  walkSpeedMps,
  type CalcResult,
  type ScoreSheet,
} from "@/lib/clinicalCalculators";

function value<T>(result: CalcResult<T>): T {
  if (!result.ok) throw new Error(`expected a value, got: ${result.error}`);
  return result.value;
}

function refusal<T>(result: CalcResult<T>): string {
  if (result.ok) throw new Error("expected a refusal");
  return result.error;
}

describe("roundTo and daysBetween", () => {
  it("rounds half away from zero without the float trap", () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(-2.5, 0)).toBe(-3);
    expect(roundTo(0.125, 2)).toBe(0.13);
  });

  it("counts whole days and refuses an unreadable date", () => {
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
    expect(daysBetween("2026-01-31", "2026-01-01")).toBe(-30);
    expect(daysBetween("not a date", "2026-01-01")).toBeNull();
  });
});

describe("correctedAgeMonths", () => {
  it("reproduces the handbook's example: 32 weeks, 22 months old, about 20 corrected", () => {
    // 22 months after birth is about 670 days.
    const r = value(correctedAgeMonths({ birthDate: "2024-12-01", onDate: "2026-10-02", gestationWeeksAtBirth: 32 }));
    expect(r.prematurityWeeks).toBe(8);
    expect(r.correctionApplied).toBe(true);
    expect(r.chronologicalMonths).toBeCloseTo(22, 0);
    expect(r.correctedMonths).toBeCloseTo(20.2, 0);
    expect(r.chronologicalMonths - r.correctedMonths).toBeCloseTo((8 * 7) / 30.4375, 0);
  });

  it("makes no correction for a child born at term or later", () => {
    const r = value(correctedAgeMonths({ birthDate: "2026-01-01", onDate: "2026-07-01", gestationWeeksAtBirth: 41 }));
    expect(r.prematurityWeeks).toBe(0);
    expect(r.correctionApplied).toBe(false);
    expect(r.correctedMonths).toBe(r.chronologicalMonths);
  });

  it("stops correcting past two years, unless the caller extends it", () => {
    const at30 = { birthDate: "2024-01-01", onDate: "2026-07-01", gestationWeeksAtBirth: 28 };
    expect(value(correctedAgeMonths(at30)).correctionApplied).toBe(false);
    expect(value(correctedAgeMonths({ ...at30, correctUntilMonths: 36 })).correctionApplied).toBe(true);
  });

  it("goes negative before the due date rather than clamping to zero", () => {
    const r = value(correctedAgeMonths({ birthDate: "2026-09-01", onDate: "2026-10-01", gestationWeeksAtBirth: 28 }));
    expect(r.correctedMonths).toBeLessThan(0);
  });

  it("refuses impossible input", () => {
    expect(refusal(correctedAgeMonths({ birthDate: "2026-10-01", onDate: "2026-09-01", gestationWeeksAtBirth: 38 }))).toMatch(/before/);
    expect(refusal(correctedAgeMonths({ birthDate: "x", onDate: "2026-09-01", gestationWeeksAtBirth: 38 }))).toMatch(/dates/);
    expect(refusal(correctedAgeMonths({ birthDate: "2026-01-01", onDate: "2026-09-01", gestationWeeksAtBirth: 15 }))).toMatch(/between/);
    expect(refusal(correctedAgeMonths({ birthDate: "2026-01-01", onDate: "2026-09-01", gestationWeeksAtBirth: Number.NaN }))).toMatch(/weeks/);
  });
});

describe("limb symmetry, extension lag and walking speed", () => {
  it("works out the symmetry index with its working", () => {
    const r = limbSymmetryIndex(62, 80);
    expect(value(r)).toBe(77.5);
    expect(r.ok && r.working).toBe("62 / 80 x 100 = 77.5%");
  });

  it("refuses a zero healthy side and a negative injured one", () => {
    expect(refusal(limbSymmetryIndex(50, 0))).toMatch(/healthy/);
    expect(refusal(limbSymmetryIndex(-1, 50))).toMatch(/negative/);
    expect(refusal(limbSymmetryIndex(Number.NaN, 50))).toMatch(/numbers/);
  });

  it("reads an extension lag from passive and active straightening", () => {
    expect(value(extensionLag(0, -8))).toBe(8);
    expect(value(extensionLag(-3, -3))).toBe(0);
    // Active straighter than passive is no lag, never a negative one.
    expect(value(extensionLag(-5, 0))).toBe(0);
  });

  it("converts a timed walk to metres per second", () => {
    expect(value(walkSpeedMps(12.5, 10))).toBe(0.8);
    expect(value(walkSpeedMps(5, 4))).toBe(0.8);
    expect(refusal(walkSpeedMps(0, 10))).toMatch(/time/);
    expect(refusal(walkSpeedMps(10, 0))).toMatch(/distance/);
  });
});

describe("trial rules", () => {
  it("averages, picks the best in the measure's own direction, and takes the middle", () => {
    expect(averageOfTrials([10, 11, 12])).toBe(11);
    expect(bestOfTrials([8, 12, 10], "higher")).toBe(12);
    expect(bestOfTrials([8, 12, 10], "lower")).toBe(8);
    expect(medianOfTrials([110, 122, 118])).toBe(118);
    expect(medianOfTrials([110, 114])).toBe(112);
  });

  it("gives nothing for no trials or a non-number, never zero", () => {
    expect(averageOfTrials([])).toBeNull();
    expect(bestOfTrials([1, Number.NaN], "higher")).toBeNull();
    expect(medianOfTrials([])).toBeNull();
  });

  it("does not reorder the caller's array", () => {
    const trials = [3, 1, 2];
    medianOfTrials(trials);
    expect(trials).toEqual([3, 1, 2]);
  });
});

describe("predicted six-minute walk", () => {
  it("applies Enright and Sherrill for men and women", () => {
    const man = { sex: "male" as const, ageYears: 60, heightCm: 170, weightKg: 70 };
    // 7.57*170 - 5.02*60 - 1.76*70 - 309 = 1286.9 - 301.2 - 123.2 - 309 = 553.5
    expect(value(predictedSixMinuteWalk(man))).toBe(554);
    const woman = { sex: "female" as const, ageYears: 60, heightCm: 160, weightKg: 60 };
    // 2.11*160 - 2.29*60 - 5.78*60 + 667 = 337.6 - 137.4 - 346.8 + 667 = 520.4
    expect(value(predictedSixMinuteWalk(woman))).toBe(520);
  });

  it("names the equation in its working", () => {
    const r = predictedSixMinuteWalk({ sex: "male", ageYears: 60, heightCm: 170, weightKg: 70 });
    expect(r.ok && r.working).toMatch(/^Enright and Sherrill/);
  });

  it("refuses to predict from the equation the clinic has not chosen yet", () => {
    expect(SIX_MINUTE_WALK_EQUATIONS.indian_adult_tbd.predict).toBeNull();
    const error = refusal(
      predictedSixMinuteWalk({ sex: "female", ageYears: 50, heightCm: 155, weightKg: 55 }, "indian_adult_tbd")
    );
    expect(error).toMatch(/not chosen/);
  });

  it("refuses implausible body measurements", () => {
    expect(refusal(predictedSixMinuteWalk({ sex: "male", ageYears: 60, heightCm: 17, weightKg: 70 }))).toMatch(/Height/);
    expect(refusal(predictedSixMinuteWalk({ sex: "male", ageYears: 12, heightCm: 170, weightKg: 70 }))).toMatch(/Age/);
  });

  it("works out a percentage of predicted", () => {
    expect(percentOfPredicted(452, 565)).toBe(80);
    expect(percentOfPredicted(400, 0)).toBeNull();
  });
});

describe("trainingHeartRate", () => {
  it("is Karvonen: resting + (max - resting) x intensity", () => {
    const r = trainingHeartRate({ restingBpm: 70, maximumBpm: 170, intensityPercent: 50, onBetaBlocker: false });
    expect(value(r)).toBe(120);
  });

  it("refuses a patient on a beta-blocker", () => {
    const error = refusal(trainingHeartRate({ restingBpm: 70, maximumBpm: 170, intensityPercent: 50, onBetaBlocker: true }));
    expect(error).toMatch(/talk test/);
  });

  it("refuses when nobody recorded whether they take one -- not asked is not no", () => {
    expect(refusal(trainingHeartRate({ restingBpm: 70, maximumBpm: 170, intensityPercent: 50, onBetaBlocker: null }))).toMatch(
      /Record whether/
    );
    expect(refusal(trainingHeartRate({ restingBpm: 70, maximumBpm: 170, intensityPercent: 50, onBetaBlocker: undefined }))).toMatch(
      /Record whether/
    );
  });

  it("refuses a maximum at or below the resting rate", () => {
    expect(refusal(trainingHeartRate({ restingBpm: 90, maximumBpm: 90, intensityPercent: 50, onBetaBlocker: false }))).toMatch(
      /Maximum/
    );
  });
});

describe("orthostaticDrop", () => {
  const lying = { systolic: 130, diastolic: 80 };

  it("is positive on a top-number drop of 20", () => {
    const r = value(orthostaticDrop({ lying, standing1Min: { systolic: 115, diastolic: 78 }, standing3Min: { systolic: 110, diastolic: 76 } }));
    expect(r.systolicDrop).toBe(20);
    expect(r.positive).toBe(true);
  });

  it("is positive on a bottom-number drop of 10 alone", () => {
    const r = value(orthostaticDrop({ lying, standing1Min: { systolic: 125, diastolic: 70 } }));
    expect(r.systolicDrop).toBe(5);
    expect(r.diastolicDrop).toBe(10);
    expect(r.positive).toBe(true);
  });

  it("is negative just under both lines, and a rise is a negative drop", () => {
    expect(value(orthostaticDrop({ lying, standing3Min: { systolic: 111, diastolic: 71 } })).positive).toBe(false);
    expect(value(orthostaticDrop({ lying, standing1Min: { systolic: 140, diastolic: 85 } })).systolicDrop).toBe(-10);
  });

  it("needs a lying reading and at least one usable standing one", () => {
    expect(refusal(orthostaticDrop({ lying }))).toMatch(/standing/);
    expect(refusal(orthostaticDrop({ lying: { systolic: 70, diastolic: 90 }, standing1Min: lying }))).toMatch(/lying/);
    expect(refusal(orthostaticDrop({ lying, standing1Min: { systolic: 400, diastolic: 80 } }))).toMatch(/usable/);
  });
});

describe("30-second chair stand norms", () => {
  it("reads the table by age band and sex", () => {
    expect(chairStandNorm(72, "female")).toEqual({ ageBand: "70-74", belowAverageUnder: 10 });
    expect(chairStandNorm(72, "male")).toEqual({ ageBand: "70-74", belowAverageUnder: 12 });
    expect(chairStandNorm(94.9, "female")?.belowAverageUnder).toBe(4);
  });

  it("has no norm outside 60-94, and says so rather than passing", () => {
    expect(chairStandNorm(59, "female")).toBeNull();
    expect(chairStandNorm(95, "male")).toBeNull();
    expect(isChairStandBelowAverage({ stands: 3, ageYears: 50, sex: "female" })).toBeNull();
  });

  it("judges below average, and arms used scores zero", () => {
    expect(isChairStandBelowAverage({ stands: 9, ageYears: 72, sex: "female" })).toBe(true);
    expect(isChairStandBelowAverage({ stands: 10, ageYears: 72, sex: "female" })).toBe(false);
    expect(isChairStandBelowAverage({ stands: 15, ageYears: 72, sex: "female", usedArms: true })).toBe(true);
  });

  it("covers seven contiguous five-year bands", () => {
    expect(CHAIR_STAND_NORMS).toHaveLength(7);
    CHAIR_STAND_NORMS.forEach((row, i) => {
      expect(row.toAge - row.fromAge).toBe(4);
      if (i > 0) expect(row.fromAge).toBe(CHAIR_STAND_NORMS[i - 1].toAge + 1);
    });
  });
});

describe("STEADI fall-risk level", () => {
  const onDate = "2026-10-12";
  const allSafer = steadiTestFindings({
    tugSeconds: 10,
    chairStands: 14,
    ageYears: 74,
    sex: "female",
    balanceStageHeld: 4,
    gaitSpeedMps: 0.9,
  });

  it("judges each test against its own line, and null for one not done", () => {
    const findings = steadiTestFindings({ tugSeconds: 12, balanceStageHeld: 2, gaitSpeedMps: 0.8 });
    const by = Object.fromEntries(findings.map((f) => [f.key, f.higherRisk]));
    expect(by).toEqual({ tug: true, chair_stand: null, four_stage_balance: true, gait_speed: false });
  });

  it("keeps two falls this year HIGH even with every test in the safer range", () => {
    const r = steadiFallRisk({
      onDate,
      falls: [
        { date: "2026-02-01", injury: false },
        { date: "2026-06-01", injury: false },
        { date: "2026-08-01", injury: false },
      ],
      screen: { fellPastYear: true, unsteady: false, worriesAboutFalling: true },
      tests: allSafer,
    });
    expect(r.level).toBe("high");
    expect(r.decidedBy).toBe("fall_history");
    expect(r.testsInSaferRange).toEqual({ safer: 4, done: 4 });
    expect(r.rule).toMatch(/3 falls/);
  });

  it("makes one fall with injury high on its own", () => {
    const r = steadiFallRisk({ onDate, falls: [{ date: "2026-09-01", injury: true }], screen: {}, tests: allSafer });
    expect(r.level).toBe("high");
    expect(r.rule).toMatch(/injury/);
  });

  it("lets falls more than a year old stop deciding it", () => {
    const r = steadiFallRisk({
      onDate,
      falls: [
        { date: "2025-01-01", injury: true },
        { date: "2025-03-01", injury: false },
      ],
      screen: { fellPastYear: false, unsteady: true, worriesAboutFalling: false },
      tests: allSafer,
    });
    expect(r.fallsInPastYear).toBe(0);
    expect(r.level).toBe("low");
    expect(r.decidedBy).toBe("tests");
  });

  it("is low on a fully negative screen with no falls", () => {
    const r = steadiFallRisk({ onDate, falls: [], screen: { fellPastYear: false, unsteady: false, worriesAboutFalling: false }, tests: [] });
    expect(r.level).toBe("low");
    expect(r.decidedBy).toBe("screen_negative");
  });

  it("is moderate when the screen is positive and a test is outside the safer range", () => {
    const tests = steadiTestFindings({ tugSeconds: 14, chairStands: 14, ageYears: 74, sex: "female" });
    const r = steadiFallRisk({ onDate, falls: [{ date: "2026-05-01", injury: false }], screen: { unsteady: true }, tests });
    expect(r.level).toBe("moderate");
    expect(r.testsInSaferRange).toEqual({ safer: 1, done: 2 });
  });

  it("is not known -- never low -- when the screen is positive and no test is done", () => {
    const r = steadiFallRisk({ onDate, falls: [], screen: { worriesAboutFalling: true }, tests: steadiTestFindings({}) });
    expect(r.level).toBeNull();
    expect(r.decidedBy).toBe("not_enough_information");
  });

  it("ignores a fall dated after the day being judged", () => {
    const r = steadiFallRisk({
      onDate,
      falls: [
        { date: "2026-11-01", injury: true },
        { date: "2026-12-01", injury: false },
      ],
      screen: { fellPastYear: false, unsteady: false, worriesAboutFalling: false },
      tests: [],
    });
    expect(r.level).toBe("low");
  });
});

describe("score sheets", () => {
  const lefs: ScoreSheet = { itemCount: 20, itemMin: 0, itemMax: 4, itemStep: 1, maxBlanks: 2, totalRule: "sum" };

  it("adds a complete sheet", () => {
    const r = scoreSheetTotal(lefs, Array(20).fill(3));
    expect(r).toMatchObject({ ok: true, total: 60, answered: 20, blanks: 0, complete: true });
    expect(scoreSheetMax(lefs)).toBe(80);
  });

  it("allows the scale's own number of blanks, and says the total is incomplete", () => {
    const answers: (number | null)[] = Array(20).fill(4);
    answers[3] = null;
    answers[7] = null;
    expect(scoreSheetTotal(lefs, answers)).toMatchObject({ ok: true, total: 72, blanks: 2, complete: false });
  });

  it("invalidates the total with too many blanks", () => {
    const answers: (number | null)[] = Array(20).fill(4);
    answers[0] = answers[1] = answers[2] = null;
    expect(scoreSheetTotal(lefs, answers)).toMatchObject({ ok: false, reason: "too_many_blanks" });
    const strict: ScoreSheet = { ...lefs, maxBlanks: 0 };
    answers[1] = answers[2] = 1;
    expect(scoreSheetTotal(strict, answers)).toMatchObject({ ok: false, reason: "too_many_blanks" });
  });

  it("refuses the wrong length, an item out of range, off its step, or nothing answered", () => {
    expect(scoreSheetTotal(lefs, [1, 2])).toMatchObject({ ok: false, reason: "wrong_length" });
    expect(scoreSheetTotal(lefs, [...Array(19).fill(1), 5])).toMatchObject({ ok: false, reason: "invalid_item" });
    expect(scoreSheetTotal(lefs, [...Array(19).fill(1), 1.5])).toMatchObject({ ok: false, reason: "invalid_item" });
    const barthelLike: ScoreSheet = { itemCount: 2, itemMin: 0, itemMax: [10, 15], itemStep: 5, maxBlanks: 2, totalRule: "sum" };
    expect(scoreSheetTotal(barthelLike, [10, 15])).toMatchObject({ ok: true, total: 25 });
    expect(scoreSheetTotal(barthelLike, [15, 15])).toMatchObject({ ok: false, reason: "invalid_item" });
    expect(scoreSheetTotal(barthelLike, [7, 15])).toMatchObject({ ok: false, reason: "invalid_item" });
    expect(scoreSheetTotal(barthelLike, [null, null])).toMatchObject({ ok: false, reason: "no_answers" });
  });

  it("subtotals each section, and a section with a blank has none", () => {
    const sheet: ScoreSheet = {
      itemCount: 5,
      itemMin: 0,
      itemMax: 2,
      itemStep: 1,
      maxBlanks: 1,
      totalRule: "sum",
      sections: [
        { key: "a", label: "A", itemCount: 2 },
        { key: "b", label: "B", itemCount: 3 },
      ],
    };
    const r = scoreSheetTotal(sheet, [2, 1, 2, null, 0]);
    expect(r).toMatchObject({ ok: true, total: 5, subtotals: { a: 3, b: null } });
  });

  it("scores Oswestry as a percentage of what the answered items could reach", () => {
    const odi: ScoreSheet = { itemCount: 10, itemMin: 0, itemMax: 5, itemStep: 1, maxBlanks: 1, totalRule: "percent_of_answered_max" };
    expect(scoreSheetTotal(odi, Array(10).fill(2))).toMatchObject({ ok: true, total: 40 });
    // Nine answered, sum 18, out of 45.
    expect(scoreSheetTotal(odi, [...Array(9).fill(2), null])).toMatchObject({ ok: true, total: 40 });
  });

  it("scores QuickDASH as ((sum / answered) - 1) x 25", () => {
    const qd: ScoreSheet = { itemCount: 11, itemMin: 1, itemMax: 5, itemStep: 1, maxBlanks: 1, totalRule: "quickdash" };
    expect(scoreSheetTotal(qd, Array(11).fill(1))).toMatchObject({ ok: true, total: 0 });
    expect(scoreSheetTotal(qd, Array(11).fill(5))).toMatchObject({ ok: true, total: 100 });
    expect(scoreSheetTotal(qd, Array(11).fill(3))).toMatchObject({ ok: true, total: 50 });
  });
});
