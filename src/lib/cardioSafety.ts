import {
  SIX_MINUTE_WALK_EQUATIONS,
  percentOfPredicted,
  predictedSixMinuteWalk,
  trainingHeartRate,
  type CalcResult,
  type Sex,
  type SixMinuteWalkEquationKey,
} from "@/lib/clinicalCalculators";
import {
  CARDIO_BETA_BLOCKER_NO,
  CARDIO_BETA_BLOCKER_NOT_SURE,
  CARDIO_BETA_BLOCKER_YES,
  CARDIO_CONDITION_OPEN_HEART,
  CARDIO_LUNG_CONDITIONS,
  CARDIO_MMRC_OPTIONS,
  CARDIO_SPO2_LIMIT_NONE,
} from "@/lib/intakeCardio";
import type { SixMinuteWalkEquationRead } from "@/lib/sixMinuteWalkEquation";

// The safety rules for Heart and lung rehabilitation (Health Profile
// redesign, phase 6a). Pure and dependency-free, so the profile, the
// pre-exercise check, the six-minute walk guide, the PDF and the tests all
// answer the same way.
//
// "Every exercise session starts with a safety check" (the handbook). What
// this module decides, and what it refuses to guess:
//  1. The oxygen stop limit is the PATIENT'S, never a fixed 90% line: the
//     doctor's figure when one is on the intake, else the handbook's
//     default for the condition -- 88% for a lung condition, 90% for a heart
//     one (and for no answer, the more cautious) -- always marked as a
//     default so nobody reads it as the doctor's. For a heart patient on the
//     default the handbook adds "or a drop of 4 points from their resting
//     level", applied during exercise.
//  2. Before exercise: resting heart rate over 120, blood pressure over
//     180/100, or oxygen at rest below the limit is "do not exercise today,
//     tell the doctor". A reading not taken is "not checked", never "clear".
//  3. A heart-rate target (Karvonen) only for a patient recorded as NOT on a
//     beta-blocker, and only from an exercise-test maximum; "Yes", "Not sure"
//     and no answer all get the talk test instead ("we did not ask" is not
//     "no").
//  4. The surgeon's breastbone precautions are active until their end date
//     in the clinic's zone (the caller passes the clinic's today); a date
//     that cannot be read is said so, never assumed to have passed.
//  5. The six-minute walk's % of predicted uses the equation the clinic
//     chose (site_settings.six_minute_walk_equation); with none chosen it is
//     "formula not chosen yet", and an unreadable setting is "we couldn't
//     check" -- never the US equation by default.
//
// Every threshold is the handbook's and TO BE VERIFIED BY A SENIOR
// PHYSIOTHERAPIST AGAINST ITS SOURCE. Nothing here is a diagnosis.

/** The handbook's defaults, used only when the doctor has set no limit. */
export const DEFAULT_SPO2_LIMIT_LUNG = 88;
export const DEFAULT_SPO2_LIMIT_HEART = 90;
/** For a heart patient on the default: a fall of this many points from the
 *  resting reading is also a reason to stop. */
export const HEART_SPO2_DROP_POINTS = 4;
/** Resting heart rate above this: do not exercise. */
export const RESTING_HEART_RATE_MAX = 120;
/** Blood pressure above either number: do not exercise. */
export const BP_SYSTOLIC_MAX = 180;
export const BP_DIASTOLIC_MAX = 100;

// --- The oxygen stop limit -------------------------------------------------------------

export type OxygenStopLimit = {
  percent: number;
  source: "doctor" | "default";
  /** Which default, or which kind of patient the doctor's figure is for. */
  basis: "lung" | "heart";
  /** For a heart patient on the default: also stop at this many points
   *  below the resting reading. Null otherwise. */
  dropFromRestPoints: number | null;
  /** "90% (default for a heart condition, until the doctor sets one)". */
  label: string;
};

function conditionBasis(intake: Readonly<Record<string, string | undefined>>): "lung" | "heart" {
  return CARDIO_LUNG_CONDITIONS.includes((intake.cardio_condition ?? "").trim()) ? "lung" : "heart";
}

/** A stored limit answer as a whole percentage, or null for "none given"
 *  and anything implausible (the intake offers 85-94%). */
export function parseSpo2LimitAnswer(raw: string | undefined | null): number | null {
  const v = (raw ?? "").trim();
  if (!v || v === CARDIO_SPO2_LIMIT_NONE) return null;
  const m = /^(\d{2})\s*%?$/.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 80 && n <= 99 ? n : null;
}

/** The patient's own oxygen stop limit: the doctor's > the default for
 *  their condition. */
export function resolveOxygenStopLimit(intake: Readonly<Record<string, string | undefined>>): OxygenStopLimit {
  const basis = conditionBasis(intake);
  const doctor = parseSpo2LimitAnswer(intake.cardio_spo2_limit);
  if (doctor !== null) {
    return { percent: doctor, source: "doctor", basis, dropFromRestPoints: null, label: `${doctor}% (set by the doctor)` };
  }
  if (basis === "lung") {
    return {
      percent: DEFAULT_SPO2_LIMIT_LUNG,
      source: "default",
      basis,
      dropFromRestPoints: null,
      label: `${DEFAULT_SPO2_LIMIT_LUNG}% (default for a lung condition, until the doctor sets one)`,
    };
  }
  return {
    percent: DEFAULT_SPO2_LIMIT_HEART,
    source: "default",
    basis,
    dropFromRestPoints: HEART_SPO2_DROP_POINTS,
    label: `${DEFAULT_SPO2_LIMIT_HEART}% or a drop of ${HEART_SPO2_DROP_POINTS} from resting (default for a heart condition, until the doctor sets one)`,
  };
}

// --- The pre-exercise check -------------------------------------------------------------------

export type Vitals = {
  restingHeartRate?: number | null;
  systolic?: number | null;
  diastolic?: number | null;
  spo2Rest?: number | null;
};

export type RedFlagCode = "resting_heart_rate_high" | "blood_pressure_high" | "spo2_below_limit";

export type RedFlag = { code: RedFlagCode; patientText: string; clinicianText: string };

export type PreExerciseCheck = {
  /** "stop": a red flag -- no exercise or test today. "clear": every reading
   *  taken and none flagged. "incomplete": nothing flagged, but a reading
   *  was not taken, so this is not a pass. */
  status: "stop" | "clear" | "incomplete";
  flags: RedFlag[];
  /** Readings not taken, in words. */
  notChecked: string[];
  /** The sentence a screen leads with when `status` is "stop". */
  refusal: { patient: string; clinician: string } | null;
};

const finite = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** The symptoms that also mean "do not exercise, contact the doctor" -- not
 *  readings, so the checklist asks them (handbook wording, plain). */
export const CARDIO_DO_NOT_EXERCISE_SYMPTOMS: readonly string[] = [
  "Chest pain at rest, or new chest pain",
  "A heart attack or unstable angina in the last month",
  "New swelling, a fever, or sudden weight gain",
];

/** Stop at once during exercise if any of these happen (handbook). */
export const CARDIO_STOP_AT_ONCE: readonly string[] = [
  "Chest pain or tightness",
  "Breathlessness that does not settle with rest",
  "Dizziness, staggering, or leg cramps",
  "Heavy sweating, or turning pale or grey",
  "Oxygen dropping below the stop limit",
];

/** The pre-exercise red flags from the vitals. */
export function preExerciseCheck(vitals: Vitals, limit: OxygenStopLimit): PreExerciseCheck {
  const flags: RedFlag[] = [];
  const notChecked: string[] = [];
  if (finite(vitals.restingHeartRate)) {
    if (vitals.restingHeartRate > RESTING_HEART_RATE_MAX) {
      flags.push({
        code: "resting_heart_rate_high",
        patientText: `Your resting heart rate is ${vitals.restingHeartRate}, over ${RESTING_HEART_RATE_MAX}.`,
        clinicianText: `Resting heart rate ${vitals.restingHeartRate} bpm (over ${RESTING_HEART_RATE_MAX}).`,
      });
    }
  } else notChecked.push("resting heart rate");
  // Each number is judged on its own: a systolic over its limit is a stop
  // even with no diastolic taken (and the other way round). A missing number
  // is still listed as not checked, but never hides a number that IS over.
  const sys = finite(vitals.systolic) ? vitals.systolic : null;
  const dia = finite(vitals.diastolic) ? vitals.diastolic : null;
  if ((sys !== null && sys > BP_SYSTOLIC_MAX) || (dia !== null && dia > BP_DIASTOLIC_MAX)) {
    const shown = `${sys ?? "?"}/${dia ?? "?"}`;
    flags.push({
      code: "blood_pressure_high",
      patientText: `Your blood pressure is ${shown}, over ${BP_SYSTOLIC_MAX}/${BP_DIASTOLIC_MAX}.`,
      clinicianText: `Blood pressure ${shown} mmHg (over ${BP_SYSTOLIC_MAX}/${BP_DIASTOLIC_MAX}).`,
    });
  }
  if (sys === null && dia === null) notChecked.push("blood pressure");
  else if (sys === null) notChecked.push("systolic (top) blood pressure number");
  else if (dia === null) notChecked.push("diastolic (bottom) blood pressure number");
  if (finite(vitals.spo2Rest)) {
    if (vitals.spo2Rest < limit.percent) {
      flags.push({
        code: "spo2_below_limit",
        patientText: `Your oxygen level is ${vitals.spo2Rest}%, below your limit of ${limit.percent}%.`,
        clinicianText: `SpO2 at rest ${vitals.spo2Rest}% (below the stop limit, ${limit.label}).`,
      });
    }
  } else notChecked.push("oxygen level");

  const status = flags.length > 0 ? "stop" : notChecked.length > 0 ? "incomplete" : "clear";
  return {
    status,
    flags,
    notChecked,
    refusal:
      flags.length > 0
        ? {
            patient: "Please don't exercise today. Rest, and tell your physiotherapist and your doctor about this reading.",
            clinician: "Do not exercise or test today. Contact the patient's doctor.",
          }
        : null,
  };
}

export type DuringExerciseCheck = {
  stop: boolean;
  reason: { patient: string; clinician: string } | null;
};

/** Oxygen during or after exercise against the limit (and, for a heart
 *  patient on the default, a 4-point fall from the resting reading). */
export function duringExerciseOxygenCheck(input: {
  spo2Lowest: number | null | undefined;
  spo2Rest?: number | null;
  limit: OxygenStopLimit;
}): DuringExerciseCheck {
  const { spo2Lowest, spo2Rest, limit } = input;
  if (!finite(spo2Lowest)) return { stop: false, reason: null };
  if (spo2Lowest < limit.percent) {
    return {
      stop: true,
      reason: {
        patient: `Your oxygen went down to ${spo2Lowest}%, below your limit of ${limit.percent}%. Stop and rest.`,
        clinician: `Lowest SpO2 ${spo2Lowest}% is below the stop limit (${limit.label}). Stop the exercise.`,
      },
    };
  }
  if (limit.dropFromRestPoints !== null && finite(spo2Rest) && spo2Rest - spo2Lowest >= limit.dropFromRestPoints) {
    return {
      stop: true,
      reason: {
        patient: `Your oxygen went down ${spo2Rest - spo2Lowest} points from your resting level. Stop and rest.`,
        clinician: `SpO2 fell ${spo2Rest - spo2Lowest} points from rest (${spo2Rest}% to ${spo2Lowest}%); the heart default stops at ${limit.dropFromRestPoints}.`,
      },
    };
  }
  return { stop: false, reason: null };
}

// --- How hard to work: Karvonen or the talk test ---------------------------------------------------

/** The intake's beta-blocker answer: true, false, or null for "not sure"
 *  and no answer (never read as "no"). */
export function betaBlockerFromIntake(intake: Readonly<Record<string, string | undefined>>): boolean | null {
  const v = (intake.cardio_beta_blocker ?? "").trim();
  if (v === CARDIO_BETA_BLOCKER_YES) return true;
  if (v === CARDIO_BETA_BLOCKER_NO) return false;
  if (v === CARDIO_BETA_BLOCKER_NOT_SURE) return null;
  return null;
}

export const TALK_TEST_GUIDANCE = {
  patient: "Exercise at a pace where you can talk in full sentences, but not sing. If you can't finish a sentence, slow down.",
  clinician: "Pace by the talk test: full sentences but not singing. A heart-rate target is not used.",
} as const;

export type EffortGuidance =
  | { mode: "heart_rate"; targetBpm: number; working: string }
  | {
      mode: "talk_test";
      /** Why a heart-rate target is not given. */
      reason: "beta_blocker" | "beta_blocker_unknown" | "no_exercise_test";
      /** A short line for the header ("On a beta-blocker: exercise is paced
       *  by the talk test, not heart rate"). */
      headline: { patient: string; clinician: string };
      guidance: typeof TALK_TEST_GUIDANCE;
    };

/**
 * The training intensity guidance. Karvonen only for a patient recorded as
 * not on a beta-blocker AND with a measured maximum (an exercise test --
 * never "220 minus age"); everyone else is paced by the talk test, with the
 * reason.
 */
export function effortGuidance(input: {
  onBetaBlocker: boolean | null;
  restingBpm?: number | null;
  maximumBpm?: number | null;
  intensityPercent?: number | null;
}): EffortGuidance {
  const talk = (reason: "beta_blocker" | "beta_blocker_unknown" | "no_exercise_test"): EffortGuidance => ({
    mode: "talk_test",
    reason,
    headline:
      reason === "beta_blocker"
        ? {
            patient: "On a beta-blocker: your exercise is paced by the talk test, not your heart rate",
            clinician: "On a beta-blocker: exercise is paced by the talk test, not heart rate",
          }
        : reason === "beta_blocker_unknown"
          ? {
              patient: "Your exercise is paced by the talk test until we know about your heart medicines",
              clinician: "Beta-blocker not recorded: talk test until it is (Karvonen refused)",
            }
          : {
              patient: "Your exercise is paced by the talk test",
              clinician: "No exercise-test maximum on file: talk test (no heart-rate target from 220 minus age)",
            },
    guidance: TALK_TEST_GUIDANCE,
  });
  if (input.onBetaBlocker === true) return talk("beta_blocker");
  if (input.onBetaBlocker !== false) return talk("beta_blocker_unknown");
  if (!finite(input.restingBpm) || !finite(input.maximumBpm) || !finite(input.intensityPercent)) return talk("no_exercise_test");
  const result: CalcResult<number> = trainingHeartRate({
    restingBpm: input.restingBpm,
    maximumBpm: input.maximumBpm,
    intensityPercent: input.intensityPercent,
    onBetaBlocker: false,
  });
  if (!result.ok) return talk("no_exercise_test");
  return { mode: "heart_rate", targetBpm: result.value, working: result.working };
}

// --- Breastbone (sternal) precautions -----------------------------------------------------------------

export type SternalPrecautions =
  | { status: "not_applicable" }
  | { status: "active"; text: string | null; until: string; daysLeft: number }
  | { status: "ended"; text: string | null; until: string }
  | { status: "end_date_unknown"; text: string | null; rawUntil: string | null };

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

function isoOf(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 2000 || y > 2100) return null;
  return date.toISOString().slice(0, 10);
}

/** A typed end date as YYYY-MM-DD: "2026-09-20", "20 Sep 2026", "20
 *  September 2026", "Sep 20, 2026" or "20/09/2026" (day first, the Indian
 *  convention). Anything else -- "six weeks", "ask the surgeon" -- is null:
 *  never guessed. */
export function parseClinicDate(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().replace(/\s+/g, " ").replace(/,/g, "");
  if (!v) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (m) return isoOf(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (m) return isoOf(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})(?:st|nd|rd|th)? ([A-Za-z]+) (\d{4})$/.exec(v);
  if (m && MONTHS[m[2].toLowerCase()]) return isoOf(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]));
  m = /^([A-Za-z]+) (\d{1,2})(?:st|nd|rd|th)? (\d{4})$/.exec(v);
  if (m && MONTHS[m[1].toLowerCase()]) return isoOf(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]));
  return null;
}

/** The surgeon's precautions, active until (and including) their end date
 *  in the clinic's zone. Only after open-heart surgery -- the question is
 *  not asked otherwise, and an answer left over from an earlier condition
 *  is not shown. `todayIso` is the clinic's today. */
export function sternalPrecautions(
  intake: Readonly<Record<string, string | undefined>>,
  todayIso: string
): SternalPrecautions {
  if ((intake.cardio_condition ?? "").trim() !== CARDIO_CONDITION_OPEN_HEART) return { status: "not_applicable" };
  const text = (intake.cardio_sternal_precautions ?? "").trim() || null;
  const rawUntil = (intake.cardio_sternal_precautions_until ?? "").trim() || null;
  if (!text && !rawUntil) return { status: "not_applicable" };
  const until = parseClinicDate(rawUntil);
  if (!until) return { status: "end_date_unknown", text, rawUntil };
  if (todayIso.slice(0, 10) <= until) {
    const daysLeft = Math.round((Date.parse(until) - Date.parse(todayIso.slice(0, 10))) / 86_400_000);
    return { status: "active", text, until, daysLeft };
  }
  return { status: "ended", text, until };
}

// --- Breathlessness in daily life (mMRC) -------------------------------------------------------------

/** The mMRC grade (0-4) the intake's breathlessness answer stands for, or
 *  null for no answer. */
export function mmrcGradeFromIntake(intake: Readonly<Record<string, string | undefined>>): number | null {
  const i = (CARDIO_MMRC_OPTIONS as readonly string[]).indexOf((intake.cardio_breathlessness ?? "").trim());
  return i >= 0 ? i : null;
}

// --- Six-minute walk, % of predicted ---------------------------------------------------------------------

export type SixMinuteWalkPrediction =
  | { status: "ok"; predictedMetres: number; percent: number | null; equation: string; working: string }
  | { status: "not_chosen"; text: string }
  | { status: "unreadable"; text: string }
  | { status: "missing"; text: string };

/** "% of predicted" by the clinic's chosen equation, or why there is none.
 *  Height and weight are not on the patient record yet, so a caller without
 *  them gets "missing" naming what is needed. */
export function sixMinuteWalkPrediction(input: {
  walkedMetres: number | null;
  equation: SixMinuteWalkEquationRead;
  person: { sex: Sex | null; ageYears: number | null; heightCm?: number | null; weightKg?: number | null };
}): SixMinuteWalkPrediction {
  if (input.equation.status !== "ok") return { status: "unreadable", text: "We couldn't check which formula the clinic uses." };
  if (!input.equation.chosen) return { status: "not_chosen", text: "Predicted distance: formula not chosen yet." };
  const key: SixMinuteWalkEquationKey = input.equation.key;
  const { sex, ageYears, heightCm, weightKg } = input.person;
  const missing = [
    sex ? null : "sex",
    finite(ageYears) ? null : "age",
    finite(heightCm) ? null : "height",
    finite(weightKg) ? null : "weight",
  ].filter((x): x is string => x !== null);
  if (missing.length > 0) return { status: "missing", text: `Predicted distance needs the patient's ${missing.join(", ")}.` };
  const result = predictedSixMinuteWalk({ sex: sex!, ageYears: ageYears!, heightCm: heightCm!, weightKg: weightKg! }, key);
  if (!result.ok) return { status: "missing", text: result.error };
  return {
    status: "ok",
    predictedMetres: result.value,
    percent: finite(input.walkedMetres) ? percentOfPredicted(input.walkedMetres, result.value) : null,
    equation: SIX_MINUTE_WALK_EQUATIONS[key].label,
    working: result.working,
  };
}
