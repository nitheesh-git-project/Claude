import { describe, expect, it } from "vitest";
import { scoreSheetMax } from "@/lib/clinicalCalculators";
import { NEURO_SCALES } from "@/lib/neuroExam";
import {
  JOINT_MOVEMENTS,
  OUTCOME_MEASURES,
  PROFILE_KINDS,
  PROFILE_KIND_LABELS,
  WHO_MOTOR_MILESTONES,
  bandFor,
  changeDirection,
  isMeasureEnabled,
  isMeaningfulChange,
  isProfileKind,
  measurementSource,
  measuresForProfileKind,
  needsMedicationState,
  outcomeMeasure,
  profileKindsForSpecialty,
  riskBand,
  usualJointRange,
  validateMeasurement,
  validateMeasurementConditions,
  validateMeasurementValue,
  maxTrialsFor,
  trialsRequired,
  STANDS_WITH_ARMS_KEY,
  usedArmsEntry,
  validateUsedArms,
} from "@/lib/outcomeMeasures";

const NOW = Date.parse("2026-10-12T10:00:00.000Z");
const AN_HOUR_AGO = new Date(NOW - 3_600_000).toISOString();

function accepted(raw: unknown, ctx: Parameters<typeof validateMeasurement>[1]) {
  const r = validateMeasurement(raw, ctx);
  if (!r.ok) throw new Error(`expected valid, got: ${r.error}`);
  return r.measurement;
}

function refused(raw: unknown, ctx: Parameters<typeof validateMeasurement>[1]): string {
  const r = validateMeasurement(raw, ctx);
  if (r.ok) throw new Error("expected a refusal");
  return r.error;
}

describe("the registry", () => {
  it("holds every row of the handbook's 'All measures at a glance' table", () => {
    const handbookTable = [
      "pain_nprs",
      "joint_range",
      "strength_symmetry",
      "lefs",
      "barthel",
      "berg_balance",
      "ten_metre_walk",
      "tug",
      "fugl_meyer_ue",
      "modified_ashworth",
      "fac",
      "who_motor_milestone",
      "peds_standing_seconds",
      "peds_independent_steps",
      "hoehn_yahr",
      "five_sit_to_stand",
      "mini_bestest",
      "freezing_episodes",
      "chair_stand_30s",
      "four_stage_balance",
      "gait_speed_4m",
      "katz_adl",
      "orthostatic_bp",
      "six_minute_walk",
      "breathlessness_nrs",
      "resting_heart_rate",
      "lowest_spo2",
      "active_minutes",
      "mmrc",
      "one_minute_sit_to_stand",
    ];
    for (const key of handbookTable) expect(outcomeMeasure(key), key).not.toBeNull();
  });

  it("has unique keys", () => {
    expect(new Set(OUTCOME_MEASURES.map((m) => m.key)).size).toBe(OUTCOME_MEASURES.length);
  });

  it("keeps every licensed scale the owner named, and keeps all of them off", () => {
    const licensed = OUTCOME_MEASURES.filter((m) => m.licence === "licensed").map((m) => m.key);
    for (const key of [
      "barthel",
      "oswestry",
      "neck_disability_index",
      "quickdash",
      "gmfm",
      "aims",
      "peabody",
      "cat",
      "borg_cr10",
      "borg_rpe",
      "mds_updrs_3",
    ]) {
      expect(licensed, key).toContain(key);
    }
    for (const m of OUTCOME_MEASURES) {
      expect(m.enabledByDefault, m.key).toBe(m.licence !== "licensed");
    }
  });

  it("switches a licensed measure on only when the clinic has", () => {
    expect(isMeasureEnabled("barthel")).toBe(false);
    expect(isMeasureEnabled("barthel", new Set(["barthel"]))).toBe(true);
    expect(isMeasureEnabled("lefs")).toBe(true);
    expect(isMeasureEnabled("no_such_measure", new Set(["no_such_measure"]))).toBe(false);
  });

  it("gives every measure a sane range, kinds, grades and score sheet", () => {
    for (const m of OUTCOME_MEASURES) {
      expect(m.min, m.key).toBeLessThan(m.max);
      expect(m.profileKinds.length, m.key).toBeGreaterThan(0);
      for (const kind of m.profileKinds) expect(isProfileKind(kind), `${m.key}: ${kind}`).toBe(true);
      for (const g of m.grades ?? []) {
        expect(g.value, m.key).toBeGreaterThanOrEqual(m.min);
        expect(g.value, m.key).toBeLessThanOrEqual(m.max);
      }
      if (m.variants) expect(new Set(m.variants.map((v) => v.key)).size, m.key).toBe(m.variants.length);
      const sheet = m.scoreSheet;
      if (sheet) {
        if (typeof sheet.itemMax !== "number") expect(sheet.itemMax.length, m.key).toBe(sheet.itemCount);
        if (sheet.itemLabels) expect(sheet.itemLabels.length, m.key).toBe(sheet.itemCount);
        if (sheet.sections) {
          expect(sheet.sections.reduce((s, x) => s + x.itemCount, 0), m.key).toBe(sheet.itemCount);
        }
        if (sheet.totalRule === "sum") expect(scoreSheetMax(sheet), m.key).toBe(m.max);
      }
    }
  });

  it("sums the score sheets the handbook names to their published totals", () => {
    const totals: Record<string, number> = { barthel: 100, lefs: 80, fugl_meyer_ue: 66, mini_bestest: 28, katz_adl: 6 };
    for (const [key, total] of Object.entries(totals)) {
      expect(scoreSheetMax(outcomeMeasure(key)!.scoreSheet!), key).toBe(total);
    }
    expect(outcomeMeasure("fugl_meyer_ue")!.scoreSheet!.sections!.map((s) => s.itemCount)).toEqual([18, 5, 7, 3]);
  });

  it("names the six profile kinds, with Parkinson's under neuro and the two phase-6a types each their own", () => {
    expect(PROFILE_KINDS).toHaveLength(6);
    for (const kind of PROFILE_KINDS) expect(PROFILE_KIND_LABELS[kind].patientLabel).toBeTruthy();
    expect(profileKindsForSpecialty("neuro")).toEqual(["neuro", "neuro_parkinsons"]);
    expect(profileKindsForSpecialty("ortho")).toEqual(["ortho"]);
    expect(profileKindsForSpecialty("pediatrics")).toEqual(["pediatrics"]);
    expect(profileKindsForSpecialty("geriatric")).toEqual(["geriatric"]);
    expect(profileKindsForSpecialty("cardiopulmonary")).toEqual(["cardiopulmonary"]);
    expect(PROFILE_KIND_LABELS.geriatric).toEqual({ label: "Geriatric", patientLabel: "Strength and balance care" });
    expect(PROFILE_KIND_LABELS.cardiopulmonary).toEqual({ label: "Cardiopulmonary", patientLabel: "Heart and lung rehabilitation" });
    for (const kind of PROFILE_KINDS) expect(measuresForProfileKind(kind).length, kind).toBeGreaterThan(0);
  });
});

describe("the boundary with the Pain Map and the neurological exam", () => {
  it("reads pain from the Pain Map and never writes it here", () => {
    expect(measurementSource("pain_nprs", "ortho")).toBe("pain_map");
  });

  it("reads Berg and the Modified Ashworth from the neuro exam, and copies neither", () => {
    expect(measurementSource("berg_balance", "neuro")).toBe("neuro_exam");
    expect(measurementSource("modified_ashworth", "neuro")).toBe("neuro_exam");
    // Berg's fourteen item scores belong to neuroExam.ts.
    expect(outcomeMeasure("berg_balance")!.scoreSheet).toBeUndefined();
    // None of the exam's own grading scales is re-declared as a measure.
    const keys = new Set(OUTCOME_MEASURES.map((m) => m.key));
    for (const scale of Object.keys(NEURO_SCALES)) {
      if (scale === "mas") continue; // a pointer entry, `modified_ashworth`
      expect(keys.has(scale), scale).toBe(false);
    }
  });

  it("takes TUG and walking speed from the exam for neuro, and stores them for the others", () => {
    expect(measurementSource("tug", "neuro")).toBe("neuro_exam");
    expect(measurementSource("tug", "neuro_parkinsons")).toBe("outcome_measurements");
    expect(measurementSource("tug", "geriatric")).toBe("outcome_measurements");
    expect(measurementSource("ten_metre_walk", "neuro")).toBe("neuro_exam");
    expect(measurementSource("ten_metre_walk", "neuro_parkinsons")).toBe("outcome_measurements");
  });

  it("reads the WHO milestones and GMFCS from the paediatric exam, and keeps the two timed counts here", () => {
    // One owner each (pedsExam.ts): the exam holds status, date first seen
    // and seen or reported; the timed counts keep their three tries here.
    expect(measurementSource("who_motor_milestone", "pediatrics")).toBe("peds_exam");
    expect(measurementSource("gmfcs", "pediatrics")).toBe("peds_exam");
    expect(measurementSource("peds_standing_seconds", "pediatrics")).toBe("outcome_measurements");
    expect(measurementSource("peds_independent_steps", "pediatrics")).toBe("outcome_measurements");
  });

  it("requires ON/OFF on Parkinson's measures only", () => {
    expect(needsMedicationState("tug", "neuro_parkinsons")).toBe(true);
    expect(needsMedicationState("tug", "geriatric")).toBe(false);
    expect(needsMedicationState("six_minute_walk", "cardiopulmonary")).toBe(false);
  });
});

describe("validateMeasurementValue", () => {
  it("accepts a value in range and rounds it to the measure's precision", () => {
    expect(validateMeasurementValue("tug", 12.345)).toEqual({ ok: true, value: 12.3 });
    expect(validateMeasurementValue("lefs", 80)).toEqual({ ok: true, value: 80 });
  });

  it("refuses out of range, a non-number, and an unknown measure", () => {
    expect(validateMeasurementValue("lefs", 81).ok).toBe(false);
    expect(validateMeasurementValue("pain_nprs", -1).ok).toBe(false);
    expect(validateMeasurementValue("tug", "12" as unknown).ok).toBe(false);
    expect(validateMeasurementValue("tug", Number.POSITIVE_INFINITY).ok).toBe(false);
    expect(validateMeasurementValue("nope", 1).ok).toBe(false);
  });

  it("allows only a scale's own grades", () => {
    expect(validateMeasurementValue("hoehn_yahr", 2.5).ok).toBe(true);
    expect(validateMeasurementValue("hoehn_yahr", 3.5).ok).toBe(false);
    expect(validateMeasurementValue("fac", 4).ok).toBe(true);
  });

  it("holds Barthel to its steps of five", () => {
    expect(validateMeasurementValue("barthel", 55).ok).toBe(true);
    expect(validateMeasurementValue("barthel", 57).ok).toBe(false);
    expect(validateMeasurementValue("borg_cr10", 0.5).ok).toBe(true);
  });
});

describe("changeDirection and isMeaningfulChange", () => {
  it("calls a change under the MDC no change, in Parkinson's TUG", () => {
    // The mockup's "Improving" on a 3.4 s TUG change was the error this guards.
    expect(changeDirection("tug", 15, 11.6, { profileKind: "neuro_parkinsons" })).toBe("no_change");
    expect(changeDirection("tug", 15, 11.5, { profileKind: "neuro_parkinsons" })).toBe("better");
    expect(changeDirection("tug", 11, 15, { profileKind: "neuro_parkinsons" })).toBe("worse");
  });

  it("falls back to the MCID where no MDC is known", () => {
    expect(changeDirection("lefs", 40, 48)).toBe("no_change");
    expect(changeDirection("lefs", 40, 49)).toBe("better");
    expect(changeDirection("pain_nprs", 7, 5)).toBe("better");
    expect(changeDirection("pain_nprs", 3, 4)).toBe("no_change");
  });

  it("uses the conservative end of a range (Berg 5-7)", () => {
    expect(changeDirection("berg_balance", 40, 46)).toBe("no_change");
    expect(changeDirection("berg_balance", 40, 47)).toBe("better");
  });

  it("judges joint range toward normal, and widens the allowance between testers", () => {
    expect(changeDirection("joint_range", 100, 110, { normal: 135 })).toBe("better");
    expect(changeDirection("joint_range", -8, 0, { normal: 0 })).toBe("better");
    expect(changeDirection("joint_range", 120, 110, { normal: 135 })).toBe("worse");
    expect(changeDirection("joint_range", 100, 108, { normal: 135, differentTester: true })).toBe("no_change");
    expect(changeDirection("joint_range", 100, 108, { normal: 135 })).toBe("better");
    // No normal given: the numbers moved, and nothing here can say which way is good.
    expect(changeDirection("joint_range", 100, 110)).toBe("changed");
  });

  it("never calls a stage or a classification better or worse", () => {
    expect(changeDirection("hoehn_yahr", 2, 3)).toBe("changed");
    expect(changeDirection("gmfcs", 3, 2)).toBe("changed");
  });

  it("still names the better or worse direction when no threshold is known", () => {
    expect(changeDirection("strength_symmetry", 78, 90)).toBe("better");
    expect(changeDirection("strength_symmetry", 90, 78)).toBe("worse");
    expect(changeDirection("strength_symmetry", 78, 78)).toBe("no_change");
  });

  it("measures a meaningful change by the MCID, per profile kind where it differs", () => {
    expect(isMeaningfulChange("lefs", 40, 49)).toBe(true);
    expect(isMeaningfulChange("lefs", 40, 31)).toBe(true);
    expect(isMeaningfulChange("lefs", 40, 48)).toBe(false);
    expect(isMeaningfulChange("ten_metre_walk", 0.5, 0.66, "neuro")).toBe(true);
    expect(isMeaningfulChange("ten_metre_walk", 0.5, 0.65, "neuro")).toBe(false);
    expect(isMeaningfulChange("ten_metre_walk", 0.5, 0.66, "neuro_parkinsons")).toBeNull();
    expect(isMeaningfulChange("strength_symmetry", 70, 90)).toBeNull();
  });
});

describe("riskBand and bandFor", () => {
  it("draws TUG's line per profile kind", () => {
    expect(riskBand("tug", 14, { profileKind: "neuro" })).toMatchObject({ band: "higher_risk" });
    expect(riskBand("tug", 13.9, { profileKind: "neuro" })).toMatchObject({ band: "not_flagged" });
    expect(riskBand("tug", 11.5, { profileKind: "neuro_parkinsons" })).toMatchObject({ band: "not_flagged" });
    expect(riskBand("tug", 11.6, { profileKind: "neuro_parkinsons" })).toMatchObject({ band: "higher_risk", line: 11.5 });
    expect(riskBand("tug", 12, { profileKind: "geriatric" })).toMatchObject({ band: "higher_risk", line: 12 });
  });

  it("reports the most severe Berg line crossed", () => {
    expect(riskBand("berg_balance", 46, { profileKind: "neuro" })).toMatchObject({ band: "not_flagged" });
    expect(riskBand("berg_balance", 45, { profileKind: "neuro" })).toMatchObject({ band: "higher_risk" });
    expect(riskBand("berg_balance", 39, { profileKind: "neuro" })).toMatchObject({ band: "very_high_risk", line: 40 });
  });

  it("has no answer for a measure with no cut-off", () => {
    expect(riskBand("lefs", 20, { profileKind: "ortho" })).toBeNull();
    expect(riskBand("mini_bestest", 10, { profileKind: "neuro" })).toBeNull();
  });

  it("says 'unknown' rather than 'not flagged' when the line needs what was not given", () => {
    expect(riskBand("lowest_spo2", 85, { profileKind: "cardiopulmonary" })).toEqual({ band: "unknown", reason: "needs_patient_limit" });
    expect(riskBand("lowest_spo2", 87, { profileKind: "cardiopulmonary", patientLimit: 88 })).toMatchObject({ band: "higher_risk" });
    expect(riskBand("lowest_spo2", 90, { profileKind: "cardiopulmonary", patientLimit: 88 })).toMatchObject({ band: "not_flagged" });
    expect(riskBand("chair_stand_30s", 9, { profileKind: "geriatric" })).toEqual({ band: "unknown", reason: "needs_age_and_sex" });
    expect(riskBand("chair_stand_30s", 9, { profileKind: "geriatric", ageYears: 50, sex: "female" })).toEqual({
      band: "unknown",
      reason: "outside_norm_table",
    });
    expect(riskBand("chair_stand_30s", 9, { profileKind: "geriatric", ageYears: 72, sex: "female" })).toMatchObject({
      band: "higher_risk",
      line: 10,
    });
  });

  it("flags heel-to-toe not held and a positive orthostatic drop", () => {
    expect(riskBand("four_stage_balance", 2, { profileKind: "geriatric" })).toMatchObject({ band: "higher_risk" });
    expect(riskBand("four_stage_balance", 3, { profileKind: "geriatric" })).toMatchObject({ band: "not_flagged" });
    expect(riskBand("orthostatic_bp", 20, { profileKind: "geriatric" })).toMatchObject({ band: "higher_risk" });
  });

  it("names the descriptive bands", () => {
    expect(bandFor("pain_nprs", 3)).toMatch(/^Mild/);
    expect(bandFor("pain_nprs", 4)).toMatch(/^Moderate/);
    expect(bandFor("pain_nprs", 7)).toMatch(/^Severe/);
    expect(bandFor("barthel", 20)).toMatch(/^Total/);
    expect(bandFor("barthel", 100)).toMatch(/^Independent/);
    expect(bandFor("ten_metre_walk", 0.39)).toMatch(/house/);
    expect(bandFor("ten_metre_walk", 0.8)).toMatch(/neighbourhood/);
    expect(bandFor("lefs", 50)).toBeNull();
  });
});

describe("the shared tables", () => {
  it("finds the usual range for a joint-range variant", () => {
    expect(usualJointRange("knee_flexion_active")).toBe(135);
    expect(usualJointRange("knee_extension_passive")).toBe(0);
    expect(usualJointRange("knee_flexion")).toBeNull();
    expect(new Set(JOINT_MOVEMENTS.map((m) => m.key)).size).toBe(JOINT_MOVEMENTS.length);
  });

  it("holds the six WHO windows, each a real range", () => {
    expect(WHO_MOTOR_MILESTONES).toHaveLength(6);
    for (const m of WHO_MOTOR_MILESTONES) expect(m.windowMonths[0]).toBeLessThan(m.windowMonths[1]);
  });
});

describe("validateMeasurementConditions", () => {
  const ctx = { measureKey: "tug", profileKind: "geriatric" as const, measuredAtMs: NOW };

  it("needs to know whether it was in person or over video", () => {
    expect(validateMeasurementConditions({}, ctx).ok).toBe(false);
    expect(validateMeasurementConditions(null, ctx).ok).toBe(false);
    expect(validateMeasurementConditions({ setting: "in_person" }, ctx).ok).toBe(true);
  });

  it("refuses an unknown condition and over-long text", () => {
    expect(validateMeasurementConditions({ setting: "in_person", mood: "good" }, ctx).ok).toBe(false);
    expect(validateMeasurementConditions({ setting: "in_person", walkingAid: "x".repeat(81) }, ctx).ok).toBe(false);
  });

  it("needs ON/OFF and the last dose on a Parkinson's measurement", () => {
    const pd = { ...ctx, profileKind: "neuro_parkinsons" as const };
    expect(validateMeasurementConditions({ setting: "in_person" }, pd).ok).toBe(false);
    expect(validateMeasurementConditions({ setting: "in_person", medicationState: "on" }, pd).ok).toBe(false);
    expect(
      validateMeasurementConditions({ setting: "in_person", medicationState: "on", lastDoseAt: AN_HOUR_AGO }, pd).ok
    ).toBe(true);
    const later = new Date(NOW + 3_600_000).toISOString();
    expect(validateMeasurementConditions({ setting: "in_person", medicationState: "on", lastDoseAt: later }, pd).ok).toBe(false);
  });

  it("holds each measure to where it may be done", () => {
    expect(validateMeasurementConditions({ setting: "video" }, ctx).ok).toBe(false);
    expect(validateMeasurementConditions({ setting: "video", helperPresent: true }, ctx).ok).toBe(true);
    const sixMinute = { measureKey: "six_minute_walk", profileKind: "cardiopulmonary" as const, measuredAtMs: NOW };
    expect(validateMeasurementConditions({ setting: "video" }, sixMinute).ok).toBe(false);
    const gait = { measureKey: "gait_speed_4m", profileKind: "geriatric" as const, measuredAtMs: NOW };
    expect(validateMeasurementConditions({ setting: "video" }, gait).ok).toBe(false);
    expect(validateMeasurementConditions({ setting: "video", homeMeasured: true }, gait).ok).toBe(true);
  });
});

describe("validateMeasurement", () => {
  const geri = { profileKind: "geriatric" as const, nowMs: NOW };
  const tug = { measureKey: "tug", value: 13.2, measuredAt: AN_HOUR_AGO, conditions: { setting: "in_person", walkingAid: "Stick" } };

  it("accepts a well-formed measurement", () => {
    const m = accepted(tug, geri);
    expect(m).toMatchObject({ measureKey: "tug", value: 13.2, side: null, variant: null, items: null, schemaVersion: 1 });
    expect(m.conditions.walkingAid).toBe("Stick");
  });

  it("refuses a licensed measure until the clinic switches it on", () => {
    const barthel = { measureKey: "barthel", value: 60, measuredAt: AN_HOUR_AGO, conditions: { setting: "in_person" } };
    expect(refused(barthel, geri)).toMatch(/licence/);
    expect(accepted(barthel, { ...geri, enabledLicensed: new Set(["barthel"]) }).value).toBe(60);
  });

  it("refuses a measure on the wrong kind of profile, or one another layer owns", () => {
    expect(refused({ ...tug, measureKey: "lefs", value: 40 }, geri)).toMatch(/not used/);
    expect(refused(tug, { profileKind: "neuro", nowMs: NOW })).toMatch(/neurological examination/);
    expect(refused({ ...tug, measureKey: "pain_nprs", value: 4, variant: "now" }, { profileKind: "ortho", nowMs: NOW })).toMatch(
      /Pain Map/
    );
  });

  it("checks a score sheet's items add up to its stored total", () => {
    const katz = { measureKey: "katz_adl", measuredAt: AN_HOUR_AGO, conditions: { setting: "in_person" }, items: [1, 1, 0, 1, 1, 1] };
    expect(accepted({ ...katz, value: 5 }, geri).items).toEqual([1, 1, 0, 1, 1, 1]);
    expect(refused({ ...katz, value: 6 }, geri)).toMatch(/does not match/);
    expect(refused({ ...katz, value: 4, items: [1, 1, null, null, 1, 0] }, geri)).toMatch(/Every item/);
    expect(refused({ ...tug, measureKey: "chair_stand_30s", value: 10, items: [1] }, geri)).toMatch(/only when the arms were used/);
  });

  it("works an orthostatic value out of its readings and refuses one that disagrees", () => {
    const readings = {
      lying_systolic: 130,
      lying_diastolic: 80,
      standing_1min_systolic: 112,
      standing_1min_diastolic: 76,
    };
    const ortho = { measureKey: "orthostatic_bp", measuredAt: AN_HOUR_AGO, conditions: { setting: "in_person" } };
    expect(accepted({ ...ortho, value: 18, items: readings }, geri).items).toEqual(readings);
    expect(refused({ ...ortho, value: 20, items: readings }, geri)).toMatch(/does not match/);
    expect(refused({ ...ortho, value: 18 }, geri)).toMatch(/readings/);
    expect(refused({ ...ortho, value: 18, items: { ...readings, pulse: 70 } }, geri)).toMatch(/unknown reading/);
    expect(refused({ ...ortho, value: 0, items: { lying_systolic: 130, lying_diastolic: 80 } }, geri)).toMatch(/do not give/);
  });

  it("needs the side and the variant where the measure has them", () => {
    const ortho = { profileKind: "ortho" as const, nowMs: NOW };
    const rom = { measureKey: "joint_range", value: 122, measuredAt: AN_HOUR_AGO, conditions: { setting: "in_person" } };
    expect(refused(rom, ortho)).toMatch(/which side/);
    expect(refused({ ...rom, side: "right" }, ortho)).toMatch(/which one/);
    expect(refused({ ...rom, side: "right", variant: "knee_flexion" }, ortho)).toMatch(/which one/);
    expect(accepted({ ...rom, side: "right", variant: "knee_flexion_active" }, ortho)).toMatchObject({
      side: "right",
      variant: "knee_flexion_active",
    });
    expect(refused({ ...tug, side: "left" }, geri)).toMatch(/per side/);
    expect(refused({ ...tug, variant: "x" }, geri)).toMatch(/no variants/);
  });

  it("refuses a test time in the future or more than a year ago", () => {
    expect(refused({ ...tug, measuredAt: new Date(NOW + 10 * 60_000).toISOString() }, geri)).toMatch(/future/);
    expect(accepted({ ...tug, measuredAt: new Date(NOW + 60_000).toISOString() }, geri).value).toBe(13.2);
    expect(refused({ ...tug, measuredAt: "2025-01-01T00:00:00Z" }, geri)).toMatch(/year/);
    expect(refused({ ...tug, measuredAt: undefined }, geri)).toMatch(/when/);
  });

  it("refuses a body that is not an object, or names no measure", () => {
    expect(refused(null, geri)).toMatch(/Nothing/);
    expect(refused({ value: 3 }, geri)).toMatch(/Unknown/);
  });
});

describe("the chair stand's used-arms rule (CDC: a stand needing the arms scores 0)", () => {
  const geri = { profileKind: "geriatric" as const, nowMs: NOW };
  const stand = { measureKey: "chair_stand_30s", measuredAt: AN_HOUR_AGO };

  it("stores 0 with the stands done with the arms beside it", () => {
    const m = accepted({ ...stand, value: 0, items: { standsWithArms: 7 }, conditions: { setting: "in_person", usedArms: true } }, geri);
    expect(m).toMatchObject({ value: 0, items: { standsWithArms: 7 } });
    expect(m.conditions.usedArms).toBe(true);
    expect(usedArmsEntry(7)).toEqual({ value: 0, items: { [STANDS_WITH_ARMS_KEY]: 7 } });
  });

  it("refuses a count above 0 when the arms were used", () => {
    expect(
      refused({ ...stand, value: 7, items: { standsWithArms: 7 }, conditions: { setting: "in_person", usedArms: true } }, geri)
    ).toMatch(/score is 0/);
  });

  it("needs the count with arms, as a whole number the measure could hold, and nothing else", () => {
    const used = { setting: "in_person", usedArms: true };
    expect(refused({ ...stand, value: 0, conditions: used }, geri)).toMatch(/how many stands/);
    expect(refused({ ...stand, value: 0, items: [7], conditions: used }, geri)).toMatch(/how many stands/);
    expect(refused({ ...stand, value: 0, items: { standsWithArms: 7.5 }, conditions: used }, geri)).toMatch(/whole number/);
    expect(refused({ ...stand, value: 0, items: { standsWithArms: 99 }, conditions: used }, geri)).toMatch(/whole number/);
    expect(refused({ ...stand, value: 0, items: { standsWithArms: 3, other: 1 }, conditions: used }, geri)).toMatch(/unknown reading/);
  });

  it("keeps items empty when the arms were not used, and records usedArms false", () => {
    const m = accepted({ ...stand, value: 11, conditions: { setting: "in_person", usedArms: false } }, geri);
    expect(m).toMatchObject({ value: 11, items: null });
    expect(m.conditions.usedArms).toBe(false);
    expect(accepted({ ...stand, value: 11, conditions: { setting: "in_person" } }, geri).conditions.usedArms).toBeUndefined();
    expect(refused({ ...stand, value: 11, items: { standsWithArms: 11 }, conditions: { setting: "in_person" } }, geri)).toMatch(
      /only when the arms were used/
    );
  });

  it("is refused on a measure without the rule, and must be yes or no", () => {
    const tug = { measureKey: "tug", value: 13.2, measuredAt: AN_HOUR_AGO };
    expect(refused({ ...tug, conditions: { setting: "in_person", usedArms: true } }, geri)).toMatch(/does not record whether the arms/);
    expect(refused({ ...tug, conditions: { setting: "in_person", usedArms: false } }, geri)).toMatch(/does not record whether the arms/);
    expect(refused({ ...stand, value: 0, conditions: { setting: "in_person", usedArms: "yes" } }, geri)).toMatch(/yes or no/);
    expect(OUTCOME_MEASURES.filter((m) => m.usedArmsScoresZero).map((m) => m.key)).toEqual(["chair_stand_30s"]);
  });

  it("validateUsedArms on its own", () => {
    const m = outcomeMeasure("chair_stand_30s")!;
    expect(validateUsedArms(m, false, 9, undefined)).toEqual({ ok: true, items: null });
    expect(validateUsedArms(m, true, 0, { standsWithArms: 0 })).toEqual({ ok: true, items: { standsWithArms: 0 } });
  });
});

describe("a timed test's trials", () => {
  const pd = { profileKind: "neuro_parkinsons" as const, nowMs: NOW };
  const geri = { profileKind: "geriatric" as const, nowMs: NOW };
  const onState = { setting: "in_person", medicationState: "on", lastDoseAt: new Date(NOW - 2 * 3_600_000).toISOString() };
  const tug = { measureKey: "tug", measuredAt: AN_HOUR_AGO, conditions: onState };

  it("stores Parkinson's TUG and the 10-metre walk here, with ON/OFF and all three trials", () => {
    expect(trialsRequired("tug", "neuro_parkinsons")).toBe(true);
    expect(trialsRequired("ten_metre_walk", "neuro_parkinsons")).toBe(true);
    expect(trialsRequired("tug", "geriatric")).toBe(false);
    expect(trialsRequired("lefs", "neuro_parkinsons")).toBe(false);
    const m = accepted({ ...tug, value: 12.3, items: [12.1, 12.4, 12.4] }, pd);
    expect(m.items).toEqual([12.1, 12.4, 12.4]);
    expect(m.conditions.medicationState).toBe("on");
    const walk = accepted({ ...tug, measureKey: "ten_metre_walk", value: 0.9, items: [0.88, 0.9, 0.92] }, pd);
    expect(walk.value).toBe(0.9);
  });

  it("refuses a Parkinson's TUG with fewer than three trials, or none", () => {
    expect(refused({ ...tug, value: 12.3 }, pd)).toMatch(/all 3 trials/);
    expect(refused({ ...tug, value: 12.25, items: [12.1, 12.4] }, pd)).toMatch(/all 3 trials/);
  });

  it("refuses a value that is not the trials' keep rule", () => {
    expect(refused({ ...tug, value: 12.1, items: [12.1, 12.4, 12.4] }, pd)).toMatch(/does not match the trials/);
    // Best of three, for a measure kept by its best trial.
    const peds = { profileKind: "pediatrics" as const, nowMs: NOW };
    const stand = { measureKey: "peds_standing_seconds", measuredAt: AN_HOUR_AGO, conditions: { setting: "in_person" } };
    expect(accepted({ ...stand, value: 9, items: [4, 9, 7] }, peds).value).toBe(9);
    expect(refused({ ...stand, value: 7, items: [4, 9, 7] }, peds)).toMatch(/does not match/);
  });

  it("refuses a milestone age or a GMFCS level here: the paediatric exam owns them", () => {
    const peds = { profileKind: "pediatrics" as const, nowMs: NOW };
    const at = { measuredAt: AN_HOUR_AGO, conditions: { setting: "in_person" } };
    expect(refused({ ...at, measureKey: "who_motor_milestone", variant: "walking_alone", value: 13 }, peds)).toMatch(
      /recorded in the paediatric examination/
    );
    expect(refused({ ...at, measureKey: "gmfcs", value: 2 }, peds)).toMatch(/recorded in the paediatric examination/);
  });

  it("keeps trials optional off the Parkinson's profile, and bounded", () => {
    const plain = { measureKey: "tug", measuredAt: AN_HOUR_AGO, conditions: { setting: "in_person" } };
    expect(accepted({ ...plain, value: 13.2 }, geri).items).toBeNull();
    expect(accepted({ ...plain, value: 13, items: [12, 14] }, geri).items).toEqual([12, 14]);
    expect(refused({ ...plain, value: 13, items: [13, 13, 13, 13] }, geri)).toMatch(/between 1 and 3/);
    expect(refused({ ...plain, value: 13, items: [] }, geri)).toMatch(/between 1 and 3/);
    expect(refused({ ...plain, value: 13, items: [13, "x"] }, geri)).toMatch(/a trial/);
    expect(refused({ ...plain, value: 13, items: [13, 400] }, geri)).toMatch(/a trial/);
  });

  it("lets a median rule carry its tie-breaking third reading", () => {
    expect(maxTrialsFor(outcomeMeasure("joint_range")!)).toBe(3);
    expect(maxTrialsFor(outcomeMeasure("tug")!)).toBe(3);
    const ortho = { profileKind: "ortho" as const, nowMs: NOW };
    const rom = { measureKey: "joint_range", side: "right", variant: "knee_flexion_active", measuredAt: AN_HOUR_AGO, conditions: { setting: "in_person" } };
    expect(accepted({ ...rom, value: 120, items: [112, 120, 121] }, ortho).items).toEqual([112, 120, 121]);
  });

  it("still sends an ordinary neurological patient's TUG to the exam", () => {
    expect(refused({ ...tug, value: 12.3, items: [12.1, 12.4, 12.4] }, { profileKind: "neuro", nowMs: NOW })).toMatch(
      /neurological examination/
    );
  });
});

describe("the heart and lung vitals (phase 6a)", () => {
  const cardio = { profileKind: "cardiopulmonary" as const, nowMs: NOW };
  const setting = { setting: "in_person" };

  it("stores a blood pressure with both numbers, the top one as the value, at rest or after exercise", () => {
    const m = accepted(
      { measureKey: "blood_pressure", variant: "rest", value: 124, items: { systolic: 124, diastolic: 78 }, measuredAt: AN_HOUR_AGO, conditions: setting },
      cardio
    );
    expect(m).toMatchObject({ value: 124, variant: "rest", items: { systolic: 124, diastolic: 78 } });
    expect(refused({ measureKey: "blood_pressure", variant: "rest", value: 124, items: { systolic: 124, diastolic: 130 }, measuredAt: AN_HOUR_AGO, conditions: setting }, cardio)).toMatch(
      /do not give a result/
    );
    expect(refused({ measureKey: "blood_pressure", value: 124, items: { systolic: 124, diastolic: 78 }, measuredAt: AN_HOUR_AGO, conditions: setting }, cardio)).toBeTruthy();
    expect(outcomeMeasure("blood_pressure")!.variants!.map((v) => v.key)).toEqual(["rest", "after_exercise"]);
  });

  it("keeps resting oxygen against the patient's own limit, and the talk test as context with three grades", () => {
    expect(riskBand("resting_spo2", 87, { profileKind: "cardiopulmonary", patientLimit: 88 })).toMatchObject({ band: "higher_risk" });
    expect(accepted({ measureKey: "talk_test", value: 1, measuredAt: AN_HOUR_AGO, conditions: setting }, cardio).value).toBe(1);
    expect(refused({ measureKey: "talk_test", value: 3, measuredAt: AN_HOUR_AGO, conditions: setting }, cardio)).toBeTruthy();
    expect(outcomeMeasure("talk_test")!.better).toBe("hold");
    expect(outcomeMeasure("talk_test")!.classification).toBe(true);
  });

  it("keeps both Borg scales licensed and off, with the free ratings beside them", () => {
    for (const key of ["borg_cr10", "borg_rpe", "cat"]) expect(isMeasureEnabled(key), key).toBe(false);
    for (const key of ["breathlessness_nrs", "talk_test", "blood_pressure", "resting_spo2"]) expect(isMeasureEnabled(key), key).toBe(true);
  });
});
