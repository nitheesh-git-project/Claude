import {
  orthostaticDrop,
  steadiFallRisk,
  steadiTestFindings,
  type FallRecord,
  type Sex,
  type SteadiResult,
  type SteadiTestFinding,
  type SteadiTestKey,
} from "@/lib/clinicalCalculators";
import { parseMultiSelect } from "@/lib/conditionIntake";
import {
  GERI_DAILY_HELP_NONE,
  GERI_FALLS_NONE,
  GERI_FALLS_ONE,
  GERI_FALLS_ONE_INJURED,
  GERI_FALLS_TWO_PLUS,
  GERI_KATZ_ACTIVITIES,
  GERI_NO,
  GERI_YES,
} from "@/lib/intakeGeriatric";
import { diaryProvenance, type DiaryEntry, type FallDetails } from "@/lib/patientDiary";

// The fall-risk rules for Strength and balance care (Health Profile
// redesign, phase 6a). Pure and dependency-free: the profile's "Fall risk
// today" dial, its status pill, the PDF and the tests all ask the same
// questions of the same inputs.
//
// The level is CDC STEADI's (clinicalCalculators.ts `steadiFallRisk`, the
// 2017 algorithm as the handbook states it), and the rule that decided it
// travels with it so the screen can print it beside the dial:
//  - Two or more falls in the last 12 months, or one fall with an injury,
//    is HIGH whatever the tests show, until those falls are a year old.
//    Improving tests never pretend to override it; "tests in the safer
//    range: 3 of 4" is a separate line (the handbook's fix for the mockup).
//  - Without that history, "no" to all three screening questions is low;
//    otherwise the four tests decide between low and moderate, and with no
//    test recorded the level is "not known yet", never "low".
//
// Where the falls come from, and the rule against counting one twice:
//  - The intake's "Have you fallen in the last 12 months?" is the history
//    the patient arrived with. It is dated the day it was answered (the
//    latest of those falls can have been the day before), so it keeps
//    counting for a year after the answer -- the conservative reading.
//  - The diary adds falls AFTER that answer, and only those a
//    physiotherapist has confirmed (or a clinician entered): a patient's
//    unconfirmed report is shown as "patient reported" and decides nothing,
//    the neurological profile's rule for the status pill. A diary fall
//    dated before the answer is taken to be one the answer already counts.
//
// Every threshold is the handbook's and, like the registry, TO BE VERIFIED
// BY A SENIOR PHYSIOTHERAPIST AGAINST ITS SOURCE. A level means "higher
// risk", never "will fall".

const MS_PER_DAY = 86_400_000;

/** The minimal measurement shape these rules read (outcomeSeries.ts
 *  `MeasurementPoint` satisfies it). */
export type GeriMeasurement = {
  id: string;
  measureKey: string;
  value: number;
  measuredAt: string;
  items?: unknown;
  conditions?: { usedArms?: boolean | null } | Record<string, unknown>;
};

// --- The screen ---------------------------------------------------------------------

export type SteadiScreen = {
  fellPastYear: boolean | null;
  unsteady: boolean | null;
  worriesAboutFalling: boolean | null;
  /** True: any "yes", so the four tests are due. False: "no" to all three.
   *  Null: not all three answered and none is "yes". */
  positive: boolean | null;
};

function yesNo(raw: string | undefined): boolean | null {
  const v = (raw ?? "").trim();
  if (v === GERI_YES) return true;
  if (v === GERI_NO) return false;
  return null;
}

/** The three STEADI questions from the intake. */
export function steadiScreenFromIntake(intake: Readonly<Record<string, string | undefined>>): SteadiScreen {
  const falls = (intake.geri_falls_12m ?? "").trim();
  const fellPastYear =
    falls === GERI_FALLS_NONE ? false : [GERI_FALLS_ONE, GERI_FALLS_ONE_INJURED, GERI_FALLS_TWO_PLUS].includes(falls) ? true : null;
  const unsteady = yesNo(intake.geri_unsteady);
  const worriesAboutFalling = yesNo(intake.geri_fall_worry);
  const answers = [fellPastYear, unsteady, worriesAboutFalling];
  const positive = answers.some((a) => a === true) ? true : answers.every((a) => a === false) ? false : null;
  return { fellPastYear, unsteady, worriesAboutFalling, positive };
}

/** The falls the intake answer stands for, dated the day it was answered.
 *  "Two or more" is two (the fewest it can mean); "one with an injury" is
 *  one injurious fall. No answer date is no record: an undated answer
 *  cannot be aged out, and the screen alone still says the tests are due. */
export function intakeFallRecords(
  intake: Readonly<Record<string, string | undefined>>,
  answeredOn: string | null | undefined
): FallRecord[] {
  if (!answeredOn || !Number.isFinite(Date.parse(answeredOn))) return [];
  const date = answeredOn.slice(0, 10);
  switch ((intake.geri_falls_12m ?? "").trim()) {
    case GERI_FALLS_ONE:
      return [{ date, injury: false }];
    case GERI_FALLS_ONE_INJURED:
      return [{ date, injury: true }];
    case GERI_FALLS_TWO_PLUS:
      return [
        { date, injury: false },
        { date, injury: false },
      ];
    default:
      return [];
  }
}

export type DiaryFallCount = {
  /** Falls a physiotherapist confirmed (or a clinician entered), within the
   *  window and after the intake answer: these decide the level. */
  confirmed: FallRecord[];
  /** The patient's own reports still waiting for confirmation: shown, never
   *  counted. */
  unconfirmed: number;
};

/** The diary's falls in the 12 months before `onDate`, after the intake
 *  answer (`afterIso`; none means every one counts). */
export function diaryFallsForSteadi(
  entries: readonly Pick<DiaryEntry, "kind" | "details" | "occurredAt" | "enteredByRole" | "confirmedAt">[],
  opts: { onDate: string; afterIso?: string | null; clinicDate: (iso: string) => string }
): DiaryFallCount {
  const onMs = Date.parse(opts.onDate);
  const afterMs = opts.afterIso ? Date.parse(opts.afterIso) : NaN;
  const confirmed: FallRecord[] = [];
  let unconfirmed = 0;
  for (const e of entries) {
    if (e.kind !== "fall") continue;
    const t = Date.parse(e.occurredAt);
    if (!Number.isFinite(t)) continue;
    if (Number.isFinite(onMs) && (t > onMs + MS_PER_DAY || onMs - t > 365 * MS_PER_DAY)) continue;
    if (Number.isFinite(afterMs) && t <= afterMs) continue;
    if (diaryProvenance(e) === "patient_reported") {
      unconfirmed += 1;
      continue;
    }
    confirmed.push({ date: opts.clinicDate(e.occurredAt), injury: (e.details as FallDetails)?.injured === true });
  }
  return { confirmed, unconfirmed };
}

// --- The four tests --------------------------------------------------------------------

/** The registry measure behind each STEADI test. */
export const STEADI_TEST_MEASURES: Record<SteadiTestKey, string> = {
  tug: "tug",
  chair_stand: "chair_stand_30s",
  four_stage_balance: "four_stage_balance",
  gait_speed: "gait_speed_4m",
};

export type SteadiTestReading = SteadiTestFinding & {
  measureKey: string;
  value: number | null;
  measuredAt: string | null;
  measurementId: string | null;
  /** Chair stand only: the stands needed the arms, so the score is 0. */
  usedArms?: boolean;
  /** Chair stand only: no age or sex on file, so there is no norm to judge
   *  it by -- recorded, but not counted as in or out of the safer range. */
  noNorm?: boolean;
};

function latestOf<T extends GeriMeasurement>(points: readonly T[], measureKey: string): T | null {
  let best: T | null = null;
  for (const p of points) {
    if (p.measureKey !== measureKey || !Number.isFinite(p.value)) continue;
    if (!best || Date.parse(p.measuredAt) > Date.parse(best.measuredAt) || (p.measuredAt === best.measuredAt && p.id > best.id)) best = p;
  }
  return best;
}

/** The latest reading of each STEADI test, judged against its own line. */
export function latestSteadiTests(
  points: readonly GeriMeasurement[],
  person: { ageYears: number | null; sex: Sex | null }
): SteadiTestReading[] {
  const tug = latestOf(points, "tug");
  const chair = latestOf(points, "chair_stand_30s");
  const balance = latestOf(points, "four_stage_balance");
  const gait = latestOf(points, "gait_speed_4m");
  const usedArms = (chair?.conditions as { usedArms?: unknown } | undefined)?.usedArms === true;
  const findings = steadiTestFindings({
    tugSeconds: tug?.value ?? null,
    chairStands: chair?.value ?? null,
    chairStandUsedArms: usedArms,
    ageYears: person.ageYears,
    sex: person.sex,
    balanceStageHeld: balance?.value ?? null,
    gaitSpeedMps: gait?.value ?? null,
  });
  const byKey: Record<SteadiTestKey, GeriMeasurement | null> = {
    tug,
    chair_stand: chair,
    four_stage_balance: balance,
    gait_speed: gait,
  };
  return findings.map((f) => {
    const p = byKey[f.key];
    const reading: SteadiTestReading = {
      ...f,
      measureKey: STEADI_TEST_MEASURES[f.key],
      value: p ? p.value : null,
      measuredAt: p ? p.measuredAt : null,
      measurementId: p ? p.id : null,
    };
    if (f.key === "chair_stand") {
      if (p && usedArms) reading.usedArms = true;
      if (p && f.higherRisk === null) reading.noNorm = true;
    }
    return reading;
  });
}

// --- The level ---------------------------------------------------------------------------

export type GeriatricFallRisk = SteadiResult & {
  screen: SteadiScreen;
  tests: SteadiTestReading[];
  /** Diary falls the physiotherapist has not confirmed: shown, not counted. */
  unconfirmedDiaryFalls: number;
  /** Where the falls counted came from. */
  fallsFrom: { intake: number; diary: number };
  /** "Tests in the safer range: 3 of 4", or null with no test done. */
  saferRangeLine: string | null;
  /** The diary could not be read: the level is worked out without it, and
   *  the screen must say so rather than imply a falls check was made. */
  diaryUnreadable: boolean;
};

/**
 * The STEADI level for a geriatric record, with the rule that decided it.
 * `onDate` is the clinic's today (YYYY-MM-DD); `intakeAnsweredAt` is when
 * the falls answer was given (the approved submission's time).
 */
export function geriatricFallRisk(input: {
  intake: Readonly<Record<string, string | undefined>>;
  intakeAnsweredAt: string | null;
  points: readonly GeriMeasurement[];
  /** Null when the diary could not be read. */
  diary: readonly Pick<DiaryEntry, "kind" | "details" | "occurredAt" | "enteredByRole" | "confirmedAt">[] | null;
  ageYears: number | null;
  sex: Sex | null;
  onDate: string;
  clinicDate: (iso: string) => string;
}): GeriatricFallRisk {
  const screen = steadiScreenFromIntake(input.intake);
  const fromIntake = intakeFallRecords(input.intake, input.intakeAnsweredAt ? input.clinicDate(input.intakeAnsweredAt) : null);
  const diary = input.diary
    ? diaryFallsForSteadi(input.diary, { onDate: input.onDate, afterIso: input.intakeAnsweredAt, clinicDate: input.clinicDate })
    : { confirmed: [], unconfirmed: 0 };
  const tests = latestSteadiTests(input.points, { ageYears: input.ageYears, sex: input.sex });
  const result = steadiFallRisk({
    onDate: input.onDate,
    falls: [...fromIntake, ...diary.confirmed],
    screen: {
      fellPastYear: screen.fellPastYear,
      unsteady: screen.unsteady,
      worriesAboutFalling: screen.worriesAboutFalling,
    },
    tests,
  });
  const { safer, done } = result.testsInSaferRange;
  return {
    ...result,
    screen,
    tests,
    unconfirmedDiaryFalls: diary.unconfirmed,
    fallsFrom: { intake: fromIntake.length, diary: diary.confirmed.length },
    saferRangeLine: done > 0 ? `Tests in the safer range: ${safer} of ${done}` : null,
    diaryUnreadable: input.diary === null,
  };
}

// --- Daily living (Katz) --------------------------------------------------------------------

export type KatzView = {
  /** Activities done without help, 0-6 (6 is fully independent). */
  score: number;
  outOf: 6;
  /** The activities that need help, in the patient's words. */
  needsHelpWith: string[];
  source: "measurement" | "intake";
  /** When the measurement was taken; null for the intake answer. */
  measuredAt: string | null;
};

/** The Katz score the intake's "which do you need help with" list implies:
 *  six less the activities ticked. No answer is no score -- "nothing
 *  ticked" is only "independent" when the patient said so. */
export function katzFromIntake(intake: Readonly<Record<string, string | undefined>>): KatzView | null {
  const picked = parseMultiSelect(intake.geri_daily_help);
  if (picked.length === 0) return null;
  if (picked.includes(GERI_DAILY_HELP_NONE)) {
    return { score: 6, outOf: 6, needsHelpWith: [], source: "intake", measuredAt: null };
  }
  const needsHelpWith = GERI_KATZ_ACTIVITIES.filter((a) => picked.includes(a));
  return { score: 6 - needsHelpWith.length, outOf: 6, needsHelpWith: [...needsHelpWith], source: "intake", measuredAt: null };
}

/** The latest Katz: the physiotherapist's score sheet (`katz_adl`, items 1
 *  for "without help" in the Katz order) when there is one, else the
 *  intake's answer. */
export function latestKatz(points: readonly GeriMeasurement[], intake: Readonly<Record<string, string | undefined>>): KatzView | null {
  const p = latestOf(points, "katz_adl");
  if (p) {
    const items = Array.isArray(p.items) ? p.items : null;
    const needsHelpWith =
      items && items.length === GERI_KATZ_ACTIVITIES.length
        ? GERI_KATZ_ACTIVITIES.filter((_, i) => items[i] === 0).map(String)
        : [];
    return { score: p.value, outOf: 6, needsHelpWith, source: "measurement", measuredAt: p.measuredAt };
  }
  return katzFromIntake(intake);
}

// --- Standing blood pressure ------------------------------------------------------------------

export type OrthostaticFlag =
  | { status: "not_recorded" }
  | {
      status: "positive" | "negative";
      systolicDrop: number;
      diastolicDrop: number | null;
      measuredAt: string;
      measurementId: string;
    };

/** The latest orthostatic blood pressure (the three-reading item set,
 *  `orthostatic_bp`): positive at a fall of 20 in the top number or 10 in
 *  the bottom (`orthostaticDrop`, re-derived from the stored readings). A
 *  positive result is for the patient's doctor: the profile says so and
 *  records that, nothing more. */
export function orthostaticFlag(points: readonly GeriMeasurement[]): OrthostaticFlag {
  const p = latestOf(points, "orthostatic_bp");
  if (!p) return { status: "not_recorded" };
  const r = (p.items && typeof p.items === "object" && !Array.isArray(p.items) ? p.items : {}) as Record<string, unknown>;
  const num = (k: string) => (typeof r[k] === "number" && Number.isFinite(r[k]) ? (r[k] as number) : undefined);
  const pair = (sys: string, dia: string) => {
    const s = num(sys);
    const d = num(dia);
    return s !== undefined && d !== undefined ? { systolic: s, diastolic: d } : null;
  };
  const lying = pair("lying_systolic", "lying_diastolic");
  if (lying) {
    const result = orthostaticDrop({
      lying,
      standing1Min: pair("standing_1min_systolic", "standing_1min_diastolic"),
      standing3Min: pair("standing_3min_systolic", "standing_3min_diastolic"),
    });
    if (result.ok) {
      return {
        status: result.value.positive ? "positive" : "negative",
        systolicDrop: result.value.systolicDrop,
        diastolicDrop: result.value.diastolicDrop,
        measuredAt: p.measuredAt,
        measurementId: p.id,
      };
    }
  }
  // The readings are unusable: the stored top-number drop is all there is.
  return {
    status: p.value >= 20 ? "positive" : "negative",
    systolicDrop: p.value,
    diastolicDrop: null,
    measuredAt: p.measuredAt,
    measurementId: p.id,
  };
}

// --- Age and sex for the norms ------------------------------------------------------------------

/** Whole years from a date of birth to `onDate` (both YYYY-MM-DD), or null
 *  for a missing, unreadable or impossible one. */
export function ageInYears(birthDate: string | null | undefined, onDate: string): number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}/.test(birthDate) || !/^\d{4}-\d{2}-\d{2}/.test(onDate)) return null;
  const [by, bm, bd] = birthDate.slice(0, 10).split("-").map(Number);
  const [ty, tm, td] = onDate.slice(0, 10).split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

/** The chair-stand norm's sex from `profiles.gender`; anything else is no
 *  norm, never a guess. */
export function sexForNorms(gender: string | null | undefined): Sex | null {
  const g = (gender ?? "").trim().toLowerCase();
  if (g === "female") return "female";
  if (g === "male") return "male";
  return null;
}
