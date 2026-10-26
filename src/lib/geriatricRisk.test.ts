import { describe, expect, it } from "vitest";
import {
  ageInYears,
  diaryFallsForSteadi,
  geriatricFallRisk,
  intakeFallRecords,
  katzFromIntake,
  latestKatz,
  latestSteadiTests,
  orthostaticFlag,
  sexForNorms,
  steadiScreenFromIntake,
  type GeriMeasurement,
} from "./geriatricRisk";
import {
  GERI_DAILY_HELP_NONE,
  GERI_FALLS_NONE,
  GERI_FALLS_ONE,
  GERI_FALLS_ONE_INJURED,
  GERI_FALLS_TWO_PLUS,
  GERI_NO,
  GERI_YES,
  GERI_INTAKE_QUESTIONS,
} from "./intakeGeriatric";
import { clinicDateKey } from "./clinicWeek";
import { serializeMultiSelect } from "./conditionIntake";
import type { DiaryEntry } from "./patientDiary";

const TODAY = "2026-10-26";
const intake = (over: Record<string, string> = {}) => ({
  geri_falls_12m: "No falls",
  geri_unsteady: "No",
  geri_fall_worry: "No",
  ...over,
});

let n = 0;
function m(measureKey: string, value: number, measuredAt: string, extra: Partial<GeriMeasurement> = {}): GeriMeasurement {
  n += 1;
  return { id: `m${String(n).padStart(3, "0")}`, measureKey, value, measuredAt, ...extra };
}

function fall(occurredAt: string, opts: { confirmed?: boolean; injured?: boolean; role?: "patient" | "therapist" } = {}) {
  return {
    kind: "fall" as const,
    details: { injured: opts.injured ?? false },
    occurredAt,
    enteredByRole: opts.role ?? ("patient" as const),
    confirmedAt: opts.confirmed ? occurredAt : null,
  } as Pick<DiaryEntry, "kind" | "details" | "occurredAt" | "enteredByRole" | "confirmedAt">;
}

const safeTests = [
  m("tug", 10.2, "2026-10-12T05:00:00.000Z"),
  m("chair_stand_30s", 13, "2026-10-12T05:05:00.000Z"),
  m("four_stage_balance", 3, "2026-10-12T05:10:00.000Z"),
  m("gait_speed_4m", 0.95, "2026-10-12T05:15:00.000Z"),
];

const base = { intakeAnsweredAt: "2026-08-03T06:00:00.000Z", diary: [], ageYears: 79, sex: "female" as const, onDate: TODAY, clinicDate: clinicDateKey };

describe("the STEADI screen", () => {
  it("reads the three intake answers, any yes making it positive", () => {
    expect(steadiScreenFromIntake(intake())).toMatchObject({ positive: false, fellPastYear: false });
    expect(steadiScreenFromIntake(intake({ geri_fall_worry: "Yes" }))).toMatchObject({ positive: true, worriesAboutFalling: true });
    expect(steadiScreenFromIntake(intake({ geri_falls_12m: GERI_FALLS_ONE_INJURED }))).toMatchObject({ fellPastYear: true, positive: true });
    expect(steadiScreenFromIntake({}).positive).toBeNull();
  });

  it("dates the intake's falls the day they were told, and cannot age an undated answer", () => {
    expect(intakeFallRecords(intake({ geri_falls_12m: GERI_FALLS_TWO_PLUS }), "2026-08-03")).toEqual([
      { date: "2026-08-03", injury: false },
      { date: "2026-08-03", injury: false },
    ]);
    expect(intakeFallRecords(intake({ geri_falls_12m: GERI_FALLS_ONE_INJURED }), "2026-08-03")).toEqual([{ date: "2026-08-03", injury: true }]);
    expect(intakeFallRecords(intake({ geri_falls_12m: GERI_FALLS_TWO_PLUS }), null)).toEqual([]);
  });
});

describe("geriatricFallRisk", () => {
  it("keeps two or more falls HIGH whatever the tests show, with the safer-range count apart (the handbook's fix)", () => {
    const r = geriatricFallRisk({ ...base, intake: intake({ geri_falls_12m: GERI_FALLS_TWO_PLUS, geri_unsteady: "Yes" }), points: safeTests });
    expect(r.level).toBe("high");
    expect(r.decidedBy).toBe("fall_history");
    expect(r.rule).toMatch(/whatever the tests show/);
    expect(r.saferRangeLine).toBe("Tests in the safer range: 4 of 4");
    expect(r.fallsFrom).toEqual({ intake: 2, diary: 0 });
  });

  it("makes one injurious fall high on its own", () => {
    const r = geriatricFallRisk({ ...base, intake: intake({ geri_falls_12m: GERI_FALLS_ONE_INJURED }), points: safeTests });
    expect(r.level).toBe("high");
    expect(r.injuriousFallInPastYear).toBe(true);
  });

  it("lets the falls age out a year after they were told", () => {
    const r = geriatricFallRisk({
      ...base,
      intake: intake({ geri_falls_12m: GERI_FALLS_TWO_PLUS, geri_unsteady: "Yes" }),
      intakeAnsweredAt: "2025-09-01T06:00:00.000Z",
      points: safeTests,
    });
    expect(r.level).toBe("low");
    expect(r.decidedBy).toBe("tests");
  });

  it("is low on a fully negative screen, and not known yet on a positive one with no test", () => {
    expect(geriatricFallRisk({ ...base, intake: intake(), points: [] })).toMatchObject({ level: "low", decidedBy: "screen_negative" });
    const unknown = geriatricFallRisk({ ...base, intake: intake({ geri_unsteady: "Yes" }), points: [] });
    expect(unknown.level).toBeNull();
    expect(unknown.saferRangeLine).toBeNull();
  });

  it("lets the tests decide between low and moderate without a fall history", () => {
    const slow = [...safeTests, m("tug", 13.4, "2026-10-20T05:00:00.000Z")];
    const r = geriatricFallRisk({ ...base, intake: intake({ geri_fall_worry: "Yes" }), points: slow });
    expect(r.level).toBe("moderate");
    expect(r.saferRangeLine).toBe("Tests in the safer range: 3 of 4");
  });

  it("counts only confirmed diary falls after the intake answer, and shows the rest as patient reported", () => {
    const diary = [
      fall("2026-09-10T08:00:00.000Z", { confirmed: true }),
      fall("2026-10-01T08:00:00.000Z", { confirmed: true }),
      fall("2026-10-20T08:00:00.000Z"),
      // Before the answer: already in the intake's count.
      fall("2026-07-20T08:00:00.000Z", { confirmed: true }),
    ];
    const r = geriatricFallRisk({ ...base, intake: intake({ geri_unsteady: "Yes" }), points: safeTests, diary });
    expect(r.level).toBe("high");
    expect(r.fallsFrom.diary).toBe(2);
    expect(r.unconfirmedDiaryFalls).toBe(1);
    // The patient's own report alone decides nothing.
    const onlyReported = geriatricFallRisk({ ...base, intake: intake({ geri_unsteady: "Yes" }), points: safeTests, diary: [fall("2026-10-20T08:00:00.000Z", { injured: true })] });
    expect(onlyReported.level).toBe("low");
    expect(onlyReported.unconfirmedDiaryFalls).toBe(1);
  });

  it("counts a fall a clinician entered, and an injury written in the diary", () => {
    const r = geriatricFallRisk({
      ...base,
      intake: intake({ geri_unsteady: "Yes" }),
      points: safeTests,
      diary: [fall("2026-10-02T08:00:00.000Z", { role: "therapist", injured: true })],
    });
    expect(r.level).toBe("high");
    expect(r.rule).toMatch(/injury/);
  });

  it("says when the diary could not be read", () => {
    expect(geriatricFallRisk({ ...base, intake: intake(), points: [], diary: null }).diaryUnreadable).toBe(true);
  });
});

describe("the four tests", () => {
  it("scores a chair stand with the arms as 0, and leaves it unjudged with no age or sex", () => {
    const arms = latestSteadiTests([m("chair_stand_30s", 0, "2026-10-12T05:00:00.000Z", { conditions: { usedArms: true } })], { ageYears: 79, sex: "female" });
    expect(arms.find((t) => t.key === "chair_stand")).toMatchObject({ higherRisk: true, usedArms: true });
    const noNorm = latestSteadiTests([m("chair_stand_30s", 12, "2026-10-12T05:00:00.000Z")], { ageYears: null, sex: null });
    expect(noNorm.find((t) => t.key === "chair_stand")).toMatchObject({ higherRisk: null, noNorm: true, value: 12 });
  });

  it("reads the latest of each test", () => {
    const tests = latestSteadiTests(
      [m("gait_speed_4m", 0.7, "2026-09-01T05:00:00.000Z"), m("gait_speed_4m", 0.85, "2026-10-01T05:00:00.000Z")],
      { ageYears: 79, sex: "female" }
    );
    expect(tests.find((t) => t.key === "gait_speed")).toMatchObject({ value: 0.85, higherRisk: false });
    expect(tests.find((t) => t.key === "tug")).toMatchObject({ value: null, higherRisk: null });
  });
});

describe("daily living and standing blood pressure", () => {
  it("counts Katz from the intake as six less the activities ticked, and none ticked is not an answer", () => {
    expect(katzFromIntake({ geri_daily_help: serializeMultiSelect(["Bathing or washing"]) })).toMatchObject({ score: 5, needsHelpWith: ["Bathing or washing"] });
    expect(katzFromIntake({ geri_daily_help: GERI_DAILY_HELP_NONE })).toMatchObject({ score: 6, needsHelpWith: [] });
    expect(katzFromIntake({})).toBeNull();
  });

  it("prefers the physiotherapist's score sheet over the intake", () => {
    const k = latestKatz([m("katz_adl", 4, "2026-10-12T05:00:00.000Z", { items: [0, 1, 1, 0, 1, 1] })], { geri_daily_help: GERI_DAILY_HELP_NONE });
    expect(k).toMatchObject({ score: 4, source: "measurement", needsHelpWith: ["Bathing or washing", "Getting from bed to a chair"] });
  });

  it("flags a positive orthostatic drop from the stored readings", () => {
    const items = {
      lying_systolic: 140,
      lying_diastolic: 80,
      standing_1min_systolic: 125,
      standing_1min_diastolic: 78,
      standing_3min_systolic: 116,
      standing_3min_diastolic: 76,
    };
    expect(orthostaticFlag([m("orthostatic_bp", 24, "2026-10-12T05:00:00.000Z", { items })])).toMatchObject({
      status: "positive",
      systolicDrop: 24,
      diastolicDrop: 4,
    });
    expect(orthostaticFlag([])).toEqual({ status: "not_recorded" });
  });
});

describe("age and sex for the norms", () => {
  it("counts whole years and refuses what cannot be a person's age", () => {
    expect(ageInYears("1947-11-02", TODAY)).toBe(78);
    expect(ageInYears("1947-10-26", TODAY)).toBe(79);
    expect(ageInYears(null, TODAY)).toBeNull();
    expect(ageInYears("2030-01-01", TODAY)).toBeNull();
    expect(sexForNorms("Female")).toBe("female");
    expect(sexForNorms("Prefer not to say")).toBeNull();
  });

  it("never counts a diary fall from more than a year ago", () => {
    const r = diaryFallsForSteadi([fall("2025-09-01T08:00:00.000Z", { confirmed: true })], { onDate: TODAY, clinicDate: clinicDateKey });
    expect(r.confirmed).toHaveLength(0);
  });

  it("knows every answer the rules read is one the questions offer", () => {
    const options = (key: string) => GERI_INTAKE_QUESTIONS.find((q) => q.key === key)!.options!;
    for (const a of [GERI_FALLS_NONE, GERI_FALLS_ONE, GERI_FALLS_ONE_INJURED, GERI_FALLS_TWO_PLUS]) expect(options("geri_falls_12m")).toContain(a);
    for (const key of ["geri_unsteady", "geri_fall_worry"]) expect(options(key)).toEqual([GERI_YES, GERI_NO]);
  });
});
