import { describe, expect, it } from "vitest";
import { HOME_SAFETY_ITEMS, validateMeasurement } from "./outcomeMeasures";
import { computeEntry, emptyEditorState } from "./recordTest";
import { outcomeMeasure } from "./outcomeMeasures";
import { homeSafetyView, FALLS_CHECK_STEPS } from "./geriatricProfile";
import { predictionLine, predictionNeedsList, heartRateTargetText, shapeCardioView } from "./cardioProfile";
import { afterWalkReadings, restingReadings } from "./walkMeasurements";
import type { MeasuredProfileReads } from "./progressProfileBase";
import { type MeasurementPoint, type OutcomeMeasurementRow } from "./outcomeSeries";
import { buildDiaryRequest, emptyDiaryDraft, diaryEntrySummary, offeredDiaryKinds } from "./patientDiaryForm";

const NOW = Date.parse("2026-10-26T06:30:00.000Z");
const cond = { setting: "in_person" as const };

function checklist(done: string[]) {
  const items: Record<string, number> = {};
  for (const i of HOME_SAFETY_ITEMS) items[i.key] = done.includes(i.key) ? 1 : 0;
  return items;
}

describe("the home safety check measure", () => {
  it("stores one 1 or 0 per item and the value is how many are done", () => {
    const items = checklist(["grab_rail_toilet", "stair_rails"]);
    const ok = validateMeasurement({ measureKey: "home_safety_check", value: 2, items, measuredAt: "2026-10-26T05:00:00.000Z", conditions: cond }, { profileKind: "geriatric", nowMs: NOW });
    expect(ok.ok).toBe(true);
    const wrong = validateMeasurement({ measureKey: "home_safety_check", value: 3, items, measuredAt: "2026-10-26T05:00:00.000Z", conditions: cond }, { profileKind: "geriatric", nowMs: NOW });
    expect(wrong).toMatchObject({ ok: false });
  });

  it("refuses a missing item or a value that is not a tick", () => {
    const partial = { grab_rail_toilet: 1 };
    expect(validateMeasurement({ measureKey: "home_safety_check", value: 1, items: partial, measuredAt: "2026-10-26T05:00:00.000Z", conditions: cond }, { profileKind: "geriatric", nowMs: NOW })).toMatchObject({ ok: false });
    const twos = { ...checklist([]), grab_rail_toilet: 2 };
    expect(validateMeasurement({ measureKey: "home_safety_check", value: 2, items: twos, measuredAt: "2026-10-26T05:00:00.000Z", conditions: cond }, { profileKind: "geriatric", nowMs: NOW })).toMatchObject({ ok: false });
  });

  it("is a geriatric measure only", () => {
    const r = validateMeasurement({ measureKey: "home_safety_check", value: 0, items: checklist([]), measuredAt: "2026-10-26T05:00:00.000Z", conditions: cond }, { profileKind: "cardiopulmonary", nowMs: NOW });
    expect(r).toMatchObject({ ok: false });
  });

  it("the record form needs every item answered, and an unticked one is a 0", () => {
    const m = outcomeMeasure("home_safety_check")!;
    const st = emptyEditorState(m);
    expect(computeEntry(m, st, false).value).toBeNull();
    const some = computeEntry(m, { ...st, readingTexts: { grab_rail_toilet: "1" } }, false);
    expect(some.value).toBeNull();
    expect(some.problem).toMatch(/Answer every item: 5 are left/);
    const all: Record<string, string> = {};
    for (const i of HOME_SAFETY_ITEMS) all[i.key] = i.key === "stair_rails" ? "1" : "0";
    const full = computeEntry(m, { ...st, readingTexts: all }, false);
    expect(full.value).toBe(1);
    expect(full.items).toMatchObject({ stair_rails: 1, grab_rail_toilet: 0 });
  });
});

function point(measureKey: string, measuredAt: string, value: number, items: Record<string, number> | null, id: string): MeasurementPoint {
  return { id, measureKey, value, items, measuredAt, variant: null, side: null, conditions: {}, appointmentId: null, recordedByRole: "therapist" } as unknown as MeasurementPoint;
}

describe("the home safety snapshot", () => {
  it("says n of N done, which are open, what changed since the last check", () => {
    const view = homeSafetyView([
      point("home_safety_check", "2026-08-03T05:00:00.000Z", 2, checklist(["grab_rail_toilet", "stair_rails"]), "a"),
      point("home_safety_check", "2026-10-12T05:00:00.000Z", 3, checklist(["grab_rail_toilet", "stair_rails", "night_light_bathroom"]), "b"),
    ]);
    expect(view.status).toBe("recorded");
    if (view.status !== "recorded") return;
    expect(view.done).toBe(3);
    expect(view.total).toBe(6);
    expect(view.previous).toMatchObject({ done: 2, total: 6 });
    expect(view.items.find((i) => i.key === "night_light_bathroom")).toMatchObject({ done: true, newlyDone: true });
    expect(view.items.find((i) => i.key === "grab_rail_toilet")).toMatchObject({ done: true, newlyDone: false });
    expect(view.items.filter((i) => !i.done)).toHaveLength(3);
  });
  it("is not recorded rather than zero when nobody has checked", () => {
    expect(homeSafetyView([])).toEqual({ status: "not_recorded" });
  });
  it("runs the four tests in the clinic's order", () => {
    expect(FALLS_CHECK_STEPS.map((s) => s.measureKey)).toEqual(["tug", "chair_stand_30s", "four_stage_balance", "gait_speed_4m"]);
  });
});

function row(measure_key: string, value: number, measured_at: string, extra: Partial<OutcomeMeasurementRow> = {}): OutcomeMeasurementRow {
  return {
    id: `00000000-0000-0000-0000-${Math.abs(Math.floor(Math.random() * 1e11)).toString().padStart(12, "0")}`,
    patient_id: "p1", appointment_id: null, measure_key, variant: null, side: null, value, items: null,
    conditions: { setting: "in_person" }, recorded_by: "t1", recorded_by_role: "therapist", measured_at, schema_version: 1, created_at: measured_at, ...extra,
  };
}
function reads(rows: OutcomeMeasurementRow[], equation: { status: "ok"; key: "us_adults" | "none"; chosen: boolean } | { status: "unreadable" }) {
  const r: MeasuredProfileReads & { equation: never } = {
    measurements: { status: "ok", rows },
    goals: { status: "ok", activeGoal: null, goals: [], milestones: [] },
    careStatus: { status: "ok", events: [] },
    diary: { status: "ok", entries: [] },
    intakeHistory: { status: "ok", rows: [] },
    licence: { status: "ok", keys: [] },
    person: { status: "ok", birthDate: "1960-05-01", gender: "Male" },
    summaryAuthorName: null,
    nowMs: NOW,
    todayIso: "2026-10-26",
    equation: equation as never,
  };
  return r as never;
}

describe("the predicted six-minute walk on the heart and lung view", () => {
  it("names exactly what is missing, and shows the percentage once everything is there", async () => {
    const { sixMinuteWalkEquationOptions } = await import("./sixMinuteWalkEquation");
    const key = sixMinuteWalkEquationOptions()[0].key;
    const walk = row("six_minute_walk", 400, "2026-10-12T05:00:00.000Z");
    const intake = { cardio_beta_blocker: "No" };
    const none = shapeCardioView(reads([walk], { status: "ok", key: key as never, chosen: false }), { intake, voice: "clinician" });
    expect(none.predictionNeeds).toEqual(["the clinic's formula", "height", "weight"]);
    expect(predictionLine(none, "clinician")).toBe("Predicted distance needs the clinic's formula, height, weight.");
    const noWeight = shapeCardioView(reads([walk, row("height_cm", 172, "2026-10-12T05:00:00.000Z")], { status: "ok", key: key as never, chosen: true }), { intake, voice: "patient" });
    expect(noWeight.predictionNeeds).toEqual(["weight"]);
    expect(predictionLine(noWeight, "patient")).toBe("The expected distance for someone like you needs weight.");
    const all = shapeCardioView(
      reads([walk, row("height_cm", 172, "2026-10-12T05:00:00.000Z"), row("weight_kg", 70, "2026-10-12T05:00:00.000Z"), row("weight_kg", 72, "2026-10-20T05:00:00.000Z")], { status: "ok", key: key as never, chosen: true }),
      { intake, voice: "clinician" }
    );
    expect(all.predictionNeeds).toEqual([]);
    expect(all.walk.prediction.status).toBe("ok");
    expect(all.body.weight?.value).toBe(72); // latest wins
    expect(all.patientFacts).toMatchObject({ sex: "male", heightCm: 172, weightKg: 72 });
  });

  it("says it could not check, not that something is missing, when the setting or the readings are unreadable", () => {
    const walk = row("six_minute_walk", 400, "2026-10-12T05:00:00.000Z");
    const eq = shapeCardioView(reads([walk], { status: "unreadable" }), { intake: {}, voice: "clinician" });
    expect(eq.predictionNeeds).toEqual([]);
    expect(predictionLine(eq, "clinician")).toMatch(/couldn't check which formula/);
    expect(predictionNeedsList({ equation: { status: "ok", key: "none" as never, chosen: false }, sex: "male", ageYears: 60, heightKnown: false, weightKnown: false, measuresFailed: true, personFailed: false })).toEqual([]);
  });
});

describe("the heart-rate target", () => {
  const rest = row("resting_heart_rate", 70, "2026-10-12T05:00:00.000Z");
  const max = row("max_hr_bpm", 160, "2026-10-12T05:00:00.000Z", { variant: "exercise_test" });
  const eq = { status: "ok", key: "none", chosen: false } as const;
  it("is offered only off a beta-blocker with a recorded maximum, as a range with its provenance", () => {
    const view = shapeCardioView(reads([rest, max], eq), { intake: { cardio_beta_blocker: "No" }, voice: "clinician" });
    expect(view.effort.mode).toBe("heart_rate");
    expect(heartRateTargetText(view)).toBe("Aim for 106 to 124 beats a minute (from an exercise test, 160 at most).");
  });
  it("is the talk test on a beta-blocker, for 'not sure' and with no maximum", () => {
    for (const bb of ["Yes", "Not sure", undefined] as const) {
      const v = shapeCardioView(reads([rest, max], eq), { intake: bb ? { cardio_beta_blocker: bb } : {}, voice: "patient" });
      expect(v.effort.mode).toBe("talk_test");
      expect(heartRateTargetText(v)).toBeNull();
      expect(v.effortLow).toBeNull();
    }
    const noMax = shapeCardioView(reads([rest], eq), { intake: { cardio_beta_blocker: "No" }, voice: "patient" });
    expect(noMax.effort).toMatchObject({ mode: "talk_test", reason: "no_exercise_test" });
  });
  it("labels an estimated maximum as estimated", () => {
    const est = row("max_hr_bpm", 150, "2026-10-12T05:00:00.000Z", { variant: "estimated" });
    const v = shapeCardioView(reads([rest, est], eq), { intake: { cardio_beta_blocker: "No" }, voice: "clinician" });
    expect(heartRateTargetText(v)).toMatch(/estimated, 150 at most/);
  });
});

describe("the readings a walk leaves behind", () => {
  const base = { measuredAt: "2026-10-26T05:00:00.000Z", conditions: cond };
  it("turns the resting vitals into their own readings and skips what was not taken", () => {
    const rs = restingReadings({ heartRate: 78, systolic: 128, diastolic: 80, spo2: 96, breathlessness: 1 }, base);
    expect(rs.map((r) => [r.measurement.measureKey, r.measurement.variant ?? null])).toEqual([
      ["blood_pressure", "rest"], ["resting_spo2", null], ["resting_heart_rate", null], ["breathlessness_nrs", "rest"],
    ]);
    expect(restingReadings({ heartRate: 78 }, base).map((r) => r.measurement.measureKey)).toEqual(["resting_heart_rate"]);
    for (const r of rs) expect(validateMeasurement(r.measurement, { profileKind: "cardiopulmonary", nowMs: NOW })).toMatchObject({ ok: true });
  });
  it("turns the after-walk vitals and the talk test into readings that the registry accepts", () => {
    const rs = afterWalkReadings({ systolic: 150, diastolic: 84, spo2: 91, breathlessness: 4, heartRate: 110 }, 1, base);
    expect(rs.map((r) => r.measurement.measureKey)).toEqual(["blood_pressure", "lowest_spo2", "breathlessness_nrs", "talk_test"]);
    for (const r of rs) expect(validateMeasurement(r.measurement, { profileKind: "cardiopulmonary", nowMs: NOW })).toMatchObject({ ok: true });
    expect(afterWalkReadings({}, null, base)).toEqual([]);
  });
});

describe("height, weight and the highest heart rate", () => {
  it("are free measures the physiotherapist records", () => {
    for (const [key, value, extra] of [["height_cm", 172, {}], ["weight_kg", 70.5, {}], ["max_hr_bpm", 162, { variant: "exercise_test" }]] as const) {
      expect(validateMeasurement({ measureKey: key, value, measuredAt: "2026-10-26T05:00:00.000Z", conditions: cond, ...extra }, { profileKind: "cardiopulmonary", nowMs: NOW })).toMatchObject({ ok: true });
    }
    expect(validateMeasurement({ measureKey: "max_hr_bpm", value: 162, measuredAt: "2026-10-26T05:00:00.000Z", conditions: cond }, { profileKind: "cardiopulmonary", nowMs: NOW })).toMatchObject({ ok: false });
    expect(validateMeasurement({ measureKey: "height_cm", value: 20, measuredAt: "2026-10-26T05:00:00.000Z", conditions: cond }, { profileKind: "geriatric", nowMs: NOW })).toMatchObject({ ok: false });
  });
});

describe("active minutes in the diary form", () => {
  it("is offered to a heart and lung patient and checked like the route checks it", () => {
    expect(offeredDiaryKinds("cardiopulmonary")).toEqual(["active_minutes"]);
    const draft = { ...emptyDiaryDraft(NOW, "active_minutes"), minutes: "25", intensity: "moderate" as const };
    const built = buildDiaryRequest(draft, { profileKind: "cardiopulmonary", nowMs: NOW });
    expect(built).toMatchObject({ ok: true, body: { kind: "active_minutes", details: { minutes: 25, intensity: "moderate" } } });
    expect(buildDiaryRequest({ ...draft, minutes: "0" }, { profileKind: "cardiopulmonary", nowMs: NOW })).toMatchObject({ ok: false });
    expect(buildDiaryRequest({ ...draft, minutes: "" }, { profileKind: "cardiopulmonary", nowMs: NOW })).toMatchObject({ ok: false });
    expect(diaryEntrySummary({ kind: "active_minutes", details: { minutes: 25, intensity: "moderate" } }, "patient")).toBe("25 minutes of moderate activity");
  });
});
