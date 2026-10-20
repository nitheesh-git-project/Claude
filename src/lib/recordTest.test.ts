import { describe, expect, it } from "vitest";
import {
  EMPTY_CONDITION_DRAFT,
  computeEntry,
  emptyEditorState,
  buildConditions,
  conditionFieldsFor,
  doseTimeToIso,
  mustUseTrials,
  ownedElsewhereNote,
  parseNumberText,
  previousReading,
  recordableMeasures,
  timerFor,
} from "@/lib/recordTest";
import { OUTCOME_MEASURES, outcomeMeasure, validateMeasurement, type ProfileKind } from "@/lib/outcomeMeasures";
import type { MeasureSeries } from "@/lib/outcomeSeries";

const NOW = Date.parse("2026-10-20T06:00:00.000Z"); // 11:30 in the clinic
const m = (key: string) => outcomeMeasure(key)!;

describe("recordableMeasures", () => {
  const none = new Set<string>();

  it("never offers a measure another layer owns", () => {
    const ortho = recordableMeasures("ortho", { enabledLicensed: none }).map((c) => c.measure.key);
    expect(ortho).not.toContain("pain_nprs");
    const neuro = recordableMeasures("neuro", { enabledLicensed: none }).map((c) => c.measure.key);
    for (const owned of ["berg_balance", "modified_ashworth", "tug", "ten_metre_walk"]) expect(neuro).not.toContain(owned);
    expect(neuro).toContain("fac");
  });

  it("offers a Parkinson's patient the timed walk tests the exam does not own for them", () => {
    const pd = recordableMeasures("neuro_parkinsons", { enabledLicensed: none }).map((c) => c.measure.key);
    expect(pd).toContain("tug");
    expect(pd).toContain("ten_metre_walk");
  });

  it("lists a licensed scale that is off as not selectable, with the reason", () => {
    const choices = recordableMeasures("ortho", { enabledLicensed: none });
    const oswestry = choices.find((c) => c.measure.key === "oswestry")!;
    expect(oswestry.selectable).toBe(false);
    expect(oswestry.reason).toMatch(/licence/);
    expect(choices.find((c) => c.measure.key === "lefs")!.selectable).toBe(true);
  });

  it("makes a licensed scale selectable once the clinic has switched it on", () => {
    const choices = recordableMeasures("ortho", { enabledLicensed: new Set(["oswestry"]) });
    expect(choices.find((c) => c.measure.key === "oswestry")!.selectable).toBe(true);
  });

  it("says it could not check, not that it is off, when the switch was unreadable", () => {
    const choices = recordableMeasures("ortho", { enabledLicensed: none, licenceUnreadable: true });
    const oswestry = choices.find((c) => c.measure.key === "oswestry")!;
    expect(oswestry.selectable).toBe(false);
    expect(oswestry.reason).toMatch(/couldn't check/);
    // Free measures do not depend on the switch.
    expect(choices.find((c) => c.measure.key === "lefs")!.selectable).toBe(true);
  });

  it("only offers measures used on the kind and that validateMeasurement would accept the key of", () => {
    const kinds: ProfileKind[] = ["ortho", "neuro", "neuro_parkinsons", "pediatrics", "geriatric", "cardiopulmonary"];
    for (const kind of kinds) {
      for (const c of recordableMeasures(kind, { enabledLicensed: new Set(OUTCOME_MEASURES.filter((x) => x.licence === "licensed").map((x) => x.key)) })) {
        expect(c.measure.profileKinds).toContain(kind);
        expect(c.selectable).toBe(true);
      }
    }
  });
});

describe("ownedElsewhereNote", () => {
  it("names the Pain Map for orthopaedic and the exam for neurological", () => {
    expect(ownedElsewhereNote("ortho")).toMatch(/Pain Map/);
    expect(ownedElsewhereNote("neuro")).toMatch(/neurological examination/);
  });
  it("is null where nothing lives elsewhere", () => {
    expect(ownedElsewhereNote("geriatric")).toBeNull();
  });
});

describe("conditionFieldsFor", () => {
  it("asks for ON/OFF only on the Parkinson's profile", () => {
    expect(conditionFieldsFor(m("tug"), "neuro_parkinsons").medication).toBe(true);
    expect(conditionFieldsFor(m("tug"), "geriatric").medication).toBe(false);
  });
  it("knows what video means for each test", () => {
    expect(conditionFieldsFor(m("six_minute_walk"), "cardiopulmonary").videoRefused).toBe(true);
    expect(conditionFieldsFor(m("chair_stand_30s"), "geriatric").helperOverVideo).toBe(true);
    expect(conditionFieldsFor(m("gait_speed_4m"), "geriatric").homeOverVideo).toBe(true);
  });
  it("asks about walking aid and footwear only for mobility tests", () => {
    expect(conditionFieldsFor(m("tug"), "geriatric")).toMatchObject({ walkingAid: true, footwear: true });
    expect(conditionFieldsFor(m("lefs"), "ortho")).toMatchObject({ walkingAid: false, footwear: false });
  });
});

describe("doseTimeToIso", () => {
  it("reads a time on the clinic's clock today", () => {
    // 08:30 IST = 03:00 UTC
    expect(doseTimeToIso("08:30", NOW)).toBe("2026-10-20T03:00:00.000Z");
  });
  it("falls back to yesterday when the time is still ahead", () => {
    expect(doseTimeToIso("23:15", NOW)).toBe("2026-10-19T17:45:00.000Z");
  });
  it("refuses text that is not a time", () => {
    expect(doseTimeToIso("", NOW)).toBeNull();
    expect(doseTimeToIso("8.30", NOW)).toBeNull();
    expect(doseTimeToIso("25:00", NOW)).toBeNull();
  });
  it("uses the clinic's day, not UTC's, around midnight", () => {
    // 00:30 IST on the 21st is still the 20th in UTC.
    const justAfterMidnight = Date.parse("2026-10-20T19:00:00.000Z"); // 00:30 IST, 21 Oct
    expect(doseTimeToIso("00:10", justAfterMidnight)).toBe("2026-10-20T18:40:00.000Z");
  });
});

describe("buildConditions", () => {
  it("builds conditions validateMeasurement accepts for a Parkinson's timed test", () => {
    const tug = m("tug");
    const conditions = buildConditions(
      tug,
      "neuro_parkinsons",
      { ...EMPTY_CONDITION_DRAFT, setting: "in_person", medicationState: "on", lastDoseTime: "08:30", walkingAid: " walking stick ", footwear: "shoes" },
      NOW
    );
    expect(conditions).toMatchObject({ setting: "in_person", medicationState: "on", walkingAid: "walking stick", footwear: "shoes" });
    const checked = validateMeasurement(
      { measureKey: "tug", value: 10, items: [10, 10, 10], measuredAt: new Date(NOW).toISOString(), conditions },
      { profileKind: "neuro_parkinsons", nowMs: NOW }
    );
    expect(checked.ok).toBe(true);
  });

  it("drops fields the measure does not ask for", () => {
    const conditions = buildConditions(m("lefs"), "ortho", { ...EMPTY_CONDITION_DRAFT, setting: "in_person", walkingAid: "cane", medicationState: "on" }, NOW);
    expect(conditions).toEqual({ setting: "in_person" });
  });

  it("carries the helper tick only over video for a test that needs one", () => {
    const base = { ...EMPTY_CONDITION_DRAFT, helperPresent: true };
    expect(buildConditions(m("chair_stand_30s"), "geriatric", { ...base, setting: "video" }, NOW).helperPresent).toBe(true);
    expect(buildConditions(m("chair_stand_30s"), "geriatric", { ...base, setting: "in_person" }, NOW).helperPresent).toBeUndefined();
  });

  it("is refused by validateMeasurement without a helper over video, which the dialog also checks", () => {
    const conditions = buildConditions(m("chair_stand_30s"), "geriatric", { ...EMPTY_CONDITION_DRAFT, setting: "video" }, NOW);
    const checked = validateMeasurement(
      { measureKey: "chair_stand_30s", value: 12, measuredAt: new Date(NOW).toISOString(), conditions },
      { profileKind: "geriatric", nowMs: NOW }
    );
    expect(checked.ok).toBe(false);
  });

  it("carries the chair stand's used-arms tick, and only on the chair stand", () => {
    const draft = { ...EMPTY_CONDITION_DRAFT, setting: "in_person" as const };
    expect(buildConditions(m("chair_stand_30s"), "geriatric", draft, NOW, true).usedArms).toBe(true);
    expect(buildConditions(m("chair_stand_30s"), "geriatric", draft, NOW, false).usedArms).toBe(false);
    expect(buildConditions(m("chair_stand_30s"), "geriatric", draft, NOW).usedArms).toBeUndefined();
    expect(buildConditions(m("one_minute_sit_to_stand"), "cardiopulmonary", draft, NOW, true).usedArms).toBeUndefined();
  });

  it("a timed chair stand with the arms used is 0 with the count kept, and the route's check agrees", () => {
    const stand = m("chair_stand_30s");
    const editor = { ...emptyEditorState(stand), timer: { value: 0, items: { standsWithArms: 6 }, usedArms: true } };
    const entry = computeEntry(stand, editor, true);
    expect(entry).toMatchObject({ value: 0, items: { standsWithArms: 6 }, usedArms: true });
    const conditions = buildConditions(stand, "geriatric", { ...EMPTY_CONDITION_DRAFT, setting: "in_person" }, NOW, entry.usedArms);
    const checked = validateMeasurement(
      { measureKey: stand.key, value: entry.value, items: entry.items, measuredAt: new Date(NOW).toISOString(), conditions },
      { profileKind: "geriatric", nowMs: NOW }
    );
    expect(checked.ok).toBe(true);
  });
});

describe("previousReading", () => {
  const line = (over: Partial<MeasureSeries>): MeasureSeries => ({
    key: "k",
    measureKey: "joint_range",
    variant: "knee_flexion",
    side: "right",
    medicationState: null,
    known: true,
    label: "Joint range",
    plainName: "Movement",
    variantLabel: "Knee bend",
    unit: "degrees",
    decimals: 0,
    better: "toward_normal",
    points: [
      { measurementId: "a", value: 100, measuredAt: "2026-09-01T00:00:00.000Z", reviewKey: "r1", appointmentId: null, setting: null, recordedBy: "t", testerName: null, readingsInReview: 1 },
      { measurementId: "b", value: 118, measuredAt: "2026-10-01T00:00:00.000Z", reviewKey: "r2", appointmentId: null, setting: null, recordedBy: "t", testerName: null, readingsInReview: 1 },
    ],
    ...over,
  });
  it("returns the newest reading of exactly this line", () => {
    const r = previousReading([line({})], { measureKey: "joint_range", variant: "knee_flexion", side: "right", medicationState: null });
    expect(r).toMatchObject({ value: 118, unit: "degrees" });
  });
  it("never answers with the other side or another variant", () => {
    const s = [line({})];
    expect(previousReading(s, { measureKey: "joint_range", variant: "knee_flexion", side: "left", medicationState: null })).toBeNull();
    expect(previousReading(s, { measureKey: "joint_range", variant: "knee_extension", side: "right", medicationState: null })).toBeNull();
  });
  it("keeps ON and OFF apart", () => {
    const on = line({ measureKey: "tug", variant: null, side: null, medicationState: "on" });
    expect(previousReading([on], { measureKey: "tug", variant: null, side: null, medicationState: "off" })).toBeNull();
    expect(previousReading([on], { measureKey: "tug", variant: null, side: null, medicationState: "on" })).not.toBeNull();
  });
});

describe("timerFor", () => {
  it("gives each timed test its tool", () => {
    expect(timerFor(m("tug"))).toMatchObject({ kind: "tap", count: 3, keep: "average", practice: 1 });
    expect(timerFor(m("ten_metre_walk"))).toMatchObject({ kind: "tap", distanceMetres: 10 });
    expect(timerFor(m("gait_speed_4m"))).toMatchObject({ kind: "tap", distanceMetres: 4, count: 2 });
    expect(timerFor(m("chair_stand_30s"))).toMatchObject({ kind: "countdown", seconds: 30, armsRule: true });
    expect(timerFor(m("one_minute_sit_to_stand"))).toMatchObject({ kind: "countdown", seconds: 60, armsRule: false });
    expect(timerFor(m("four_stage_balance"))).toEqual({ kind: "balance" });
    expect(timerFor(m("six_minute_walk"))).toEqual({ kind: "six_minute_walk" });
  });
  it("has none for a sheet, a rating or a hand-held reading", () => {
    for (const key of ["lefs", "fac", "joint_range", "resting_heart_rate", "strength_symmetry"]) expect(timerFor(m(key))).toBeNull();
  });
});

describe("mustUseTrials", () => {
  it("is true for a Parkinson's timed walk and false elsewhere", () => {
    expect(mustUseTrials(m("tug"), "neuro_parkinsons")).toBe(true);
    expect(mustUseTrials(m("tug"), "geriatric")).toBe(false);
  });
});

describe("parseNumberText", () => {
  it("separates blank from not-a-number", () => {
    expect(parseNumberText("  ")).toBeUndefined();
    expect(parseNumberText("12.5")).toBe(12.5);
    expect(parseNumberText("abc")).toBeNaN();
  });
});

describe("computeEntry", () => {
  const state = (key: string, patch: Partial<ReturnType<typeof emptyEditorState>> = {}) => ({ ...emptyEditorState(m(key)), ...patch });
  const check = (key: string, kind: ProfileKind, entry: ReturnType<typeof computeEntry>, extra: Record<string, unknown> = {}) =>
    validateMeasurement(
      {
        measureKey: key,
        value: entry.value,
        items: entry.items,
        measuredAt: new Date(NOW).toISOString(),
        conditions: { setting: "in_person" },
        ...extra,
      },
      { profileKind: kind, nowMs: NOW }
    );

  it("totals a score sheet the way the route does, with the blanks allowance", () => {
    const answers = Array.from({ length: 20 }, () => 3 as number | null);
    answers[0] = null;
    answers[1] = null;
    const e = computeEntry(m("lefs"), state("lefs", { answers }), false);
    expect(e.value).toBe(54);
    expect(e.working).toMatch(/2 left blank/);
    expect(check("lefs", "ortho", e).ok).toBe(true);
  });

  it("says a sheet with too many blanks has no total", () => {
    const answers = Array.from({ length: 20 }, () => null as number | null);
    answers[0] = 3;
    const e = computeEntry(m("lefs"), state("lefs", { answers }), false);
    expect(e.value).toBeNull();
    expect(e.problem).toMatch(/not valid/);
  });

  it("is quiet, not wrong, before anything is entered", () => {
    expect(computeEntry(m("lefs"), state("lefs"), false)).toMatchObject({ value: null, problem: null });
    expect(computeEntry(m("resting_heart_rate"), state("resting_heart_rate"), false)).toMatchObject({ value: null, problem: null });
  });

  it("works out the limb symmetry index from two sides' pushes", () => {
    const e = computeEntry(m("strength_symmetry"), state("strength_symmetry", { injuredTexts: ["18", "20", "22", ""], healthyTexts: ["25", "25", "25"] }), false);
    expect(e.value).toBe(80);
    expect(e.working).toMatch(/x 100/);
  });

  it("refuses a healthy side of zero rather than guessing", () => {
    const e = computeEntry(m("strength_symmetry"), state("strength_symmetry", { injuredTexts: ["10"], healthyTexts: ["0"] }), false);
    expect(e.problem).toMatch(/more than zero/);
  });

  it("derives an orthostatic drop from the readings and keeps them as items", () => {
    const e = computeEntry(
      m("orthostatic_bp"),
      state("orthostatic_bp", {
        readingTexts: { lying_systolic: "130", lying_diastolic: "80", standing_1min_systolic: "105", standing_1min_diastolic: "72" },
      }),
      false
    );
    expect(e.value).toBe(25);
    expect(check("orthostatic_bp", "geriatric", e).ok).toBe(true);
  });

  it("keeps a timer's result as value and trials", () => {
    const e = computeEntry(m("tug"), state("tug", { timer: { value: 10.2, items: [10.1, 10.2, 10.3] } }), true);
    expect(e).toMatchObject({ value: 10.2, items: [10.1, 10.2, 10.3] });
    expect(check("tug", "geriatric", e).ok).toBe(true);
  });

  it("gives nothing until the timer has produced a result", () => {
    expect(computeEntry(m("tug"), state("tug"), true).value).toBeNull();
  });

  it("takes hand-entered trials by the measure's keep rule", () => {
    const e = computeEntry(m("joint_range"), state("joint_range", { trialTexts: ["110", "114"] }), false);
    expect(e.value).toBe(112);
    const checked = validateMeasurement(
      {
        measureKey: "joint_range",
        value: e.value,
        items: e.items,
        side: "right",
        variant: "knee_flexion_active",
        measuredAt: new Date(NOW).toISOString(),
        conditions: { setting: "in_person" },
      },
      { profileKind: "ortho", nowMs: NOW }
    );
    expect(checked.ok).toBe(true);
  });

  it("uses a tapped rating", () => {
    expect(computeEntry(m("fac"), state("fac", { choice: 4 }), false).value).toBe(4);
    expect(computeEntry(m("hoehn_yahr"), state("hoehn_yahr", { choice: 2.5 }), false).value).toBe(2.5);
  });

  it("reads a typed single reading and flags text that is not a number", () => {
    expect(computeEntry(m("resting_heart_rate"), state("resting_heart_rate", { numberText: "72" }), false).value).toBe(72);
    expect(computeEntry(m("resting_heart_rate"), state("resting_heart_rate", { numberText: "7x" }), false).problem).toMatch(/number/);
  });

  it("lets a timed test be typed when the record does not need every trial", () => {
    const e = computeEntry(m("chair_stand_30s"), state("chair_stand_30s", { numberText: "11" }), false);
    expect(e.value).toBe(11);
  });
});
