import { describe, expect, it } from "vitest";
import {
  betaBlockerFromIntake,
  duringExerciseOxygenCheck,
  effortGuidance,
  mmrcGradeFromIntake,
  parseClinicDate,
  parseSpo2LimitAnswer,
  preExerciseCheck,
  resolveOxygenStopLimit,
  sixMinuteWalkPrediction,
  sternalPrecautions,
} from "./cardioSafety";
import {
  CARDIO_CONDITION_COPD,
  CARDIO_CONDITION_HEART_ATTACK,
  CARDIO_CONDITION_OPEN_HEART,
  CARDIO_MMRC_OPTIONS,
  CARDIO_SPO2_LIMIT_NONE,
  CARDIO_SPO2_LIMIT_OPTIONS,
} from "./intakeCardio";

const heart = resolveOxygenStopLimit({ cardio_condition: CARDIO_CONDITION_HEART_ATTACK });
const lung = resolveOxygenStopLimit({ cardio_condition: CARDIO_CONDITION_COPD });

describe("the oxygen stop limit", () => {
  it("is the doctor's figure when one is on file", () => {
    const l = resolveOxygenStopLimit({ cardio_condition: CARDIO_CONDITION_COPD, cardio_spo2_limit: "92%" });
    expect(l).toMatchObject({ percent: 92, source: "doctor", dropFromRestPoints: null });
    expect(l.label).toMatch(/set by the doctor/);
  });

  it("defaults to 88% for a lung condition and 90% (or a 4-point drop) for a heart one, marked as a default", () => {
    expect(lung).toMatchObject({ percent: 88, source: "default", basis: "lung", dropFromRestPoints: null });
    expect(heart).toMatchObject({ percent: 90, source: "default", basis: "heart", dropFromRestPoints: 4 });
    expect(lung.label).toMatch(/default for a lung condition/);
    expect(heart.label).toMatch(/default for a heart condition/);
  });

  it("takes the more cautious heart default with no condition, and 'no limit given' as no limit", () => {
    expect(resolveOxygenStopLimit({}).percent).toBe(90);
    expect(resolveOxygenStopLimit({ cardio_condition: CARDIO_CONDITION_COPD, cardio_spo2_limit: CARDIO_SPO2_LIMIT_NONE }).source).toBe("default");
  });

  it("reads every option the intake offers", () => {
    for (const option of CARDIO_SPO2_LIMIT_OPTIONS.slice(1)) expect(parseSpo2LimitAnswer(option), option).not.toBeNull();
    expect(parseSpo2LimitAnswer("about ninety")).toBeNull();
    expect(parseSpo2LimitAnswer("70%")).toBeNull();
  });
});

describe("the pre-exercise check", () => {
  const ok = { restingHeartRate: 72, systolic: 124, diastolic: 78, spo2Rest: 97 };

  it("is clear only when every reading was taken and none is flagged", () => {
    expect(preExerciseCheck(ok, heart)).toMatchObject({ status: "clear", flags: [], refusal: null });
    const partial = preExerciseCheck({ restingHeartRate: 72 }, heart);
    expect(partial.status).toBe("incomplete");
    expect(partial.notChecked).toEqual(["blood pressure", "oxygen level"]);
  });

  it("refuses exercise over 120 at rest, over 180/100, or below the limit, in words for each reader", () => {
    const hr = preExerciseCheck({ ...ok, restingHeartRate: 121 }, heart);
    expect(hr.status).toBe("stop");
    expect(hr.flags.map((f) => f.code)).toEqual(["resting_heart_rate_high"]);
    expect(hr.refusal!.patient).toBe("Please don't exercise today. Rest, and tell your physiotherapist and your doctor about this reading.");
    expect(hr.refusal!.clinician).toBe("Do not exercise or test today. Contact the patient's doctor.");
    expect(preExerciseCheck({ ...ok, restingHeartRate: 120 }, heart).status).toBe("clear");
    expect(preExerciseCheck({ ...ok, systolic: 181 }, heart).flags[0].code).toBe("blood_pressure_high");
    expect(preExerciseCheck({ ...ok, diastolic: 101 }, heart).flags[0].code).toBe("blood_pressure_high");
    expect(preExerciseCheck({ ...ok, systolic: 180, diastolic: 100 }, heart).status).toBe("clear");
    // The limit is the patient's own: 89% stops a heart patient, not a lung one.
    expect(preExerciseCheck({ ...ok, spo2Rest: 89 }, heart).flags[0].code).toBe("spo2_below_limit");
    expect(preExerciseCheck({ ...ok, spo2Rest: 89 }, lung).status).toBe("clear");
  });
});

describe("oxygen during exercise", () => {
  it("stops below the limit, and for a heart default at a 4-point drop from rest", () => {
    expect(duringExerciseOxygenCheck({ spo2Lowest: 87, limit: lung }).stop).toBe(true);
    expect(duringExerciseOxygenCheck({ spo2Lowest: 92, spo2Rest: 97, limit: heart }).stop).toBe(true);
    expect(duringExerciseOxygenCheck({ spo2Lowest: 94, spo2Rest: 97, limit: heart }).stop).toBe(false);
    expect(duringExerciseOxygenCheck({ spo2Lowest: 92, spo2Rest: 97, limit: lung }).stop).toBe(false);
    expect(duringExerciseOxygenCheck({ spo2Lowest: null, limit: heart }).stop).toBe(false);
  });
});

describe("how hard to work", () => {
  it("never gives a heart-rate target on a beta-blocker or when it was not recorded", () => {
    expect(betaBlockerFromIntake({ cardio_beta_blocker: "Yes" })).toBe(true);
    expect(betaBlockerFromIntake({ cardio_beta_blocker: "No" })).toBe(false);
    expect(betaBlockerFromIntake({ cardio_beta_blocker: "Not sure" })).toBeNull();
    expect(betaBlockerFromIntake({})).toBeNull();
    const on = effortGuidance({ onBetaBlocker: true, restingBpm: 70, maximumBpm: 150, intensityPercent: 50 });
    expect(on).toMatchObject({ mode: "talk_test", reason: "beta_blocker" });
    if (on.mode === "talk_test") {
      expect(on.headline.clinician).toBe("On a beta-blocker: exercise is paced by the talk test, not heart rate");
      expect(on.guidance.patient).toMatch(/talk in full sentences, but not sing/);
    }
    expect(effortGuidance({ onBetaBlocker: null, restingBpm: 70, maximumBpm: 150, intensityPercent: 50 })).toMatchObject({ reason: "beta_blocker_unknown" });
  });

  it("needs an exercise-test maximum for Karvonen, and works it out when there is one", () => {
    expect(effortGuidance({ onBetaBlocker: false, restingBpm: 70 })).toMatchObject({ mode: "talk_test", reason: "no_exercise_test" });
    expect(effortGuidance({ onBetaBlocker: false, restingBpm: 70, maximumBpm: 150, intensityPercent: 50 })).toMatchObject({ mode: "heart_rate", targetBpm: 110 });
  });
});

describe("the surgeon's precautions", () => {
  const open = (until: string) => ({ cardio_condition: CARDIO_CONDITION_OPEN_HEART, cardio_sternal_precautions: "No lifting over 4 kg", cardio_sternal_precautions_until: until });

  it("are active up to and including the end date in the clinic's zone, then ended", () => {
    expect(sternalPrecautions(open("20 Sep 2026"), "2026-09-20")).toMatchObject({ status: "active", until: "2026-09-20", daysLeft: 0 });
    expect(sternalPrecautions(open("2026-09-20"), "2026-09-10")).toMatchObject({ status: "active", daysLeft: 10 });
    expect(sternalPrecautions(open("20/09/2026"), "2026-09-21")).toMatchObject({ status: "ended" });
  });

  it("say an unreadable date is unreadable, never past", () => {
    expect(sternalPrecautions(open("six weeks after surgery"), "2026-09-21")).toMatchObject({ status: "end_date_unknown", rawUntil: "six weeks after surgery" });
  });

  it("do not apply to anyone who did not have open-heart surgery", () => {
    expect(sternalPrecautions({ ...open("20 Sep 2026"), cardio_condition: CARDIO_CONDITION_COPD }, "2026-09-10")).toEqual({ status: "not_applicable" });
  });

  it("read the date formats a person types, day first", () => {
    expect(parseClinicDate("5 September 2026")).toBe("2026-09-05");
    expect(parseClinicDate("Sep 5, 2026")).toBe("2026-09-05");
    expect(parseClinicDate("05/09/2026")).toBe("2026-09-05");
    expect(parseClinicDate("31/02/2026")).toBeNull();
    expect(parseClinicDate("")).toBeNull();
  });
});

describe("breathlessness and the walk", () => {
  it("reads the mMRC grade from the plain words", () => {
    CARDIO_MMRC_OPTIONS.forEach((option, grade) => expect(mmrcGradeFromIntake({ cardio_breathlessness: option })).toBe(grade));
    expect(mmrcGradeFromIntake({})).toBeNull();
  });

  it("says 'formula not chosen yet' and 'we couldn't check', and never falls back to the US equation", () => {
    const person = { sex: "male" as const, ageYears: 58, heightCm: 172, weightKg: 74 };
    expect(sixMinuteWalkPrediction({ walkedMetres: 430, equation: { status: "ok", key: "indian_adult_tbd", chosen: false }, person })).toEqual({
      status: "not_chosen",
      text: "Predicted distance: formula not chosen yet.",
    });
    expect(sixMinuteWalkPrediction({ walkedMetres: 430, equation: { status: "unreadable" }, person }).status).toBe("unreadable");
    const chosen = sixMinuteWalkPrediction({ walkedMetres: 430, equation: { status: "ok", key: "enright_sherrill_1998", chosen: true }, person });
    expect(chosen).toMatchObject({ status: "ok", predictedMetres: 572, percent: 75 });
    expect(sixMinuteWalkPrediction({ walkedMetres: 430, equation: { status: "ok", key: "enright_sherrill_1998", chosen: true }, person: { sex: "male", ageYears: 58 } })).toEqual({
      status: "missing",
      text: "Predicted distance needs the patient's height, weight.",
    });
  });
});
