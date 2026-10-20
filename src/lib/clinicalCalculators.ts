// The calculators behind the Health Profile's measures: corrected age, limb
// symmetry, walking speed, trial rules, predicted six-minute walk, training
// heart rate, orthostatic drop, the STEADI fall-risk level, the 30-second
// chair-stand norms and the score-sheet totals.
//
// Dependency-free on purpose (the "business maths lives in src/lib" rule):
// the "Record a test" dialog will show these numbers with their working, and
// the route that stores them will recompute them, so both have to be the
// same function -- and the tests can reason about every one of them without
// a browser or a database.
//
// Two rules hold the module together:
//
//   1. **A calculation that cannot be done says why, never a number.** Each
//      calculator that takes clinical input returns `{ ok: false, error }`
//      for an input it cannot honestly use -- a height of 0, a heart-rate
//      target for someone on a beta-blocker, an equation the clinic has not
//      chosen yet. A plausible-looking number from a bad input is the one
//      result a clinician cannot tell from a real one.
//   2. **Every result carries its working.** The physiotherapist sees how
//      the number was made ("62 / 80 x 100 = 77.5%"), which is what lets them
//      catch a value typed into the wrong box before it reaches a graph.
//
// THRESHOLDS: every cut-off, norm and equation below is copied from the
// clinic's Health Profile Assessment Handbook (draft for clinical review,
// 12 Oct 2026). Each one is marked "to be verified by a senior
// physiotherapist against its source" and none is shown to a patient until
// that has happened.
//
// Dates are plain calendar arithmetic on UTC midnights. Nothing here formats
// a date for display (that is formatDateTime.ts's job), so the clinic-zone
// rule does not reach this file.

export type CalcResult<T> = { ok: true; value: T; working: string } | { ok: false; error: string };

export type Sex = "female" | "male";

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** Round half away from zero to `decimals` places. Avoids the 1.005 -> 1.00
 *  float trap by working on the scaled value with an epsilon. */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return (Math.sign(value) * Math.round(Math.abs(value) * factor + 1e-9)) / factor;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

// --- Dates ------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;
/** The mean Gregorian month. Calendar months differ by three days, and a
 *  corrected age is quoted to a tenth of a month at most, so the mean is the
 *  honest unit. */
export const DAYS_PER_MONTH = 30.4375;

/** Whole days from `from` to `to` (both ISO dates or timestamps), or null
 *  when either cannot be read. Date-only strings parse as UTC midnight. */
export function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.floor((b - a) / MS_PER_DAY);
}

// --- Corrected age (paediatric) ----------------------------------------------

/** A term pregnancy, in weeks. Corrected age subtracts the shortfall. */
export const TERM_WEEKS = 40;
/** Corrected age is used until about two years (some clinicians use it to
 *  three for very premature children, so the caller may pass 36). To be
 *  verified by a senior physiotherapist against its source. */
export const CORRECT_AGE_UNTIL_MONTHS = 24;
/** The plausible window for weeks of pregnancy at birth. */
export const GESTATION_WEEKS_MIN = 22;
export const GESTATION_WEEKS_MAX = 45;

export type CorrectedAge = {
  chronologicalMonths: number;
  /** Negative while the child is younger than their due date. */
  correctedMonths: number;
  /** Weeks born before term; 0 for a child born at or after 40 weeks. */
  prematurityWeeks: number;
  /** False once the child is past `correctUntilMonths`, when corrected age
   *  equals chronological age by convention. */
  correctionApplied: boolean;
};

/**
 * Corrected age = age since birth - (40 - weeks of pregnancy at birth).
 * The handbook's example: born at 32 weeks and now 22 months old is about
 * 20 months corrected. Both ages are returned because the profile shows both.
 */
export function correctedAgeMonths(input: {
  birthDate: string;
  onDate: string;
  gestationWeeksAtBirth: number;
  correctUntilMonths?: number;
}): CalcResult<CorrectedAge> {
  const { birthDate, onDate, gestationWeeksAtBirth } = input;
  const correctUntil = input.correctUntilMonths ?? CORRECT_AGE_UNTIL_MONTHS;
  const days = daysBetween(birthDate, onDate);
  if (days === null) return fail("Enter the date of birth and the date of the check as dates.");
  if (days < 0) return fail("The date of the check is before the date of birth.");
  if (!isFiniteNumber(gestationWeeksAtBirth)) return fail("Enter the weeks of pregnancy at birth.");
  if (gestationWeeksAtBirth < GESTATION_WEEKS_MIN || gestationWeeksAtBirth > GESTATION_WEEKS_MAX) {
    return fail(`Weeks of pregnancy at birth must be between ${GESTATION_WEEKS_MIN} and ${GESTATION_WEEKS_MAX}.`);
  }
  const chronological = days / DAYS_PER_MONTH;
  const prematurityWeeks = Math.max(0, TERM_WEEKS - gestationWeeksAtBirth);
  const correctionApplied = prematurityWeeks > 0 && chronological < correctUntil;
  const corrected = correctionApplied ? (days - prematurityWeeks * 7) / DAYS_PER_MONTH : chronological;
  const value: CorrectedAge = {
    chronologicalMonths: roundTo(chronological, 1),
    correctedMonths: roundTo(corrected, 1),
    prematurityWeeks,
    correctionApplied,
  };
  const working = correctionApplied
    ? `${value.chronologicalMonths} months since birth - ${prematurityWeeks} weeks early = ${value.correctedMonths} months corrected`
    : prematurityWeeks > 0
      ? `${value.chronologicalMonths} months; past ${correctUntil} months, corrected age is no longer used`
      : `${value.chronologicalMonths} months; born at term, no correction`;
  return { ok: true, value, working };
}

// --- Strength and range ----------------------------------------------------------

/** Limb symmetry index = injured side / healthy side x 100, to one decimal.
 *  Same units on both sides (kg, newtons, or a hop distance). */
export function limbSymmetryIndex(injured: number, healthy: number): CalcResult<number> {
  if (!isFiniteNumber(injured) || !isFiniteNumber(healthy)) return fail("Enter both sides as numbers.");
  if (injured < 0) return fail("The injured side cannot be negative.");
  if (healthy <= 0) return fail("The healthy side must be more than zero to compare against.");
  const value = roundTo((injured / healthy) * 100, 1);
  return { ok: true, value, working: `${injured} / ${healthy} x 100 = ${value}%` };
}

/** Extension lag: how much less straight the knee is when the patient
 *  straightens it themselves than when it is moved for them. Both readings
 *  in the profile's convention (0 is straight, minus is short of straight),
 *  so -8 active against 0 passive is a lag of 8 degrees. Never negative. */
export function extensionLag(passiveDegrees: number, activeDegrees: number): CalcResult<number> {
  if (!isFiniteNumber(passiveDegrees) || !isFiniteNumber(activeDegrees)) return fail("Enter both readings in degrees.");
  const value = Math.max(0, roundTo(passiveDegrees - activeDegrees, 1));
  return { ok: true, value, working: `${passiveDegrees} passive - (${activeDegrees}) active = ${value} degrees lag` };
}

// --- Walking speed ------------------------------------------------------------------

/** Speed = distance / time, in metres per second to two decimals. The
 *  10-metre walk uses 10 m, the STEADI gait test 4 m. */
export function walkSpeedMps(seconds: number, distanceMetres: number): CalcResult<number> {
  if (!isFiniteNumber(seconds) || seconds <= 0) return fail("Enter the time in seconds, more than zero.");
  if (!isFiniteNumber(distanceMetres) || distanceMetres <= 0) return fail("Enter the distance in metres, more than zero.");
  const value = roundTo(distanceMetres / seconds, 2);
  return { ok: true, value, working: `${distanceMetres} m / ${seconds} s = ${value} m/s` };
}

// --- Trials ------------------------------------------------------------------------

function usableTrials(trials: readonly number[]): number[] | null {
  if (!Array.isArray(trials) || trials.length === 0) return null;
  if (!trials.every(isFiniteNumber)) return null;
  return [...trials];
}

/** Mean of the trials, or null for none / a non-number. Not rounded: the
 *  measure's own precision decides that. */
export function averageOfTrials(trials: readonly number[]): number | null {
  const t = usableTrials(trials);
  if (!t) return null;
  return t.reduce((sum, v) => sum + v, 0) / t.length;
}

/** The best trial, where "best" depends on the measure: the most seconds
 *  standing, the fewest seconds to walk. */
export function bestOfTrials(trials: readonly number[], better: "higher" | "lower"): number | null {
  const t = usableTrials(trials);
  if (!t) return null;
  return better === "higher" ? Math.max(...t) : Math.min(...t);
}

/** The middle trial (goniometry: if two readings differ by more than 5
 *  degrees take a third and record the middle one). Two readings give their
 *  mean. */
export function medianOfTrials(trials: readonly number[]): number | null {
  const t = usableTrials(trials);
  if (!t) return null;
  const sorted = t.sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// --- Six-minute walk -------------------------------------------------------------------

export type SixMinuteWalkInput = { sex: Sex; ageYears: number; heightCm: number; weightKg: number };

export type SixMinuteWalkEquationKey = "enright_sherrill_1998" | "indian_adult_tbd";

export type SixMinuteWalkEquation = {
  key: SixMinuteWalkEquationKey;
  /** The name printed under the track chart, so a reader knows which
   *  population the "% of predicted" is against. */
  label: string;
  population: string;
  /** null while the clinic has not chosen the equation: predicting from it
   *  is refused rather than quietly falling back to another. */
  predict: ((input: SixMinuteWalkInput) => number) | null;
  /** The equation as a sentence, for the working line. */
  formula: Record<Sex, string> | null;
};

/**
 * A named, swappable table: the profile names the equation it used, and
 * changing which one the clinic uses is a setting, never an edit to a
 * formula. To be verified by a senior physiotherapist against its source.
 */
export const SIX_MINUTE_WALK_EQUATIONS: Record<SixMinuteWalkEquationKey, SixMinuteWalkEquation> = {
  enright_sherrill_1998: {
    key: "enright_sherrill_1998",
    // "US adults" is in the name on purpose: it is selectable, but the clinic
    // must see that it is choosing another country's population.
    label: "Enright and Sherrill (1998), US adults",
    population: "Healthy adults in the USA, aged 40 to 80",
    // To be verified by a senior physiotherapist against its source.
    predict: ({ sex, ageYears, heightCm, weightKg }) =>
      sex === "male"
        ? 7.57 * heightCm - 5.02 * ageYears - 1.76 * weightKg - 309
        : 2.11 * heightCm - 2.29 * weightKg - 5.78 * ageYears + 667,
    formula: {
      male: "7.57 x height - 5.02 x age - 1.76 x weight - 309",
      female: "2.11 x height - 2.29 x weight - 5.78 x age + 667",
    },
  },
  // TODO(clinic): reference equations for Indian adults have been published;
  // the handbook asks the clinic to pick one and use it consistently. Fill in
  // `predict` and `formula` from the chosen paper (and the population it was
  // drawn from) once a senior physiotherapist has chosen it -- until then
  // this entry refuses to predict.
  indian_adult_tbd: {
    key: "indian_adult_tbd",
    label: "Indian adult reference equation (not yet chosen)",
    population: "Adults in India -- the clinic has not chosen the equation yet",
    predict: null,
    formula: null,
  },
};

/**
 * The placeholder: "the clinic has not chosen a formula yet". It is what
 * the profile uses until an admin picks one on Settings -> Clinical
 * Questions (site_settings.six_minute_walk_equation, src/lib/sixMinuteWalkEquation.ts),
 * and what an unset or unreadable setting means. It refuses to predict, so
 * nothing ever falls back silently to the US equation.
 */
export const SIX_MINUTE_WALK_EQUATION_NOT_CHOSEN: SixMinuteWalkEquationKey = "indian_adult_tbd";

/** What the profile uses until the clinic chooses otherwise: the
 *  placeholder, never a population's formula. */
export const DEFAULT_SIX_MINUTE_WALK_EQUATION: SixMinuteWalkEquationKey = SIX_MINUTE_WALK_EQUATION_NOT_CHOSEN;

/** The key is required: a default here is how a prediction would quietly
 *  use an equation nobody chose. */
export function predictedSixMinuteWalk(input: SixMinuteWalkInput, equationKey: SixMinuteWalkEquationKey): CalcResult<number> {
  const equation = SIX_MINUTE_WALK_EQUATIONS[equationKey];
  if (!equation) return fail("Unknown six-minute walk equation.");
  if (!equation.predict || !equation.formula) {
    return fail(`${equation.label}: the clinic has not chosen this equation yet, so no prediction is made.`);
  }
  const { sex, ageYears, heightCm, weightKg } = input;
  if (sex !== "female" && sex !== "male") return fail("The equation needs the patient's sex.");
  if (!isFiniteNumber(ageYears) || ageYears < 18 || ageYears > 100) return fail("Age must be between 18 and 100.");
  if (!isFiniteNumber(heightCm) || heightCm < 120 || heightCm > 220) return fail("Height must be between 120 and 220 cm.");
  if (!isFiniteNumber(weightKg) || weightKg < 30 || weightKg > 250) return fail("Weight must be between 30 and 250 kg.");
  const value = Math.round(equation.predict(input));
  if (value <= 0) return fail("The equation does not give a usable prediction for these values.");
  return { ok: true, value, working: `${equation.label}: ${equation.formula[sex]} = ${value} m` };
}

/** Walked distance as a whole-number percentage of the predicted one. */
export function percentOfPredicted(walkedMetres: number, predictedMetres: number): number | null {
  if (!isFiniteNumber(walkedMetres) || !isFiniteNumber(predictedMetres) || predictedMetres <= 0 || walkedMetres < 0) {
    return null;
  }
  return Math.round((walkedMetres / predictedMetres) * 100);
}

// --- Training heart rate ---------------------------------------------------------------

/**
 * Karvonen: target = resting + (maximum - resting) x intensity%. Refused
 * outright for a patient on a beta-blocker, whose heart rate stays low
 * whatever the effort -- effort and the talk test are their measures. And
 * refused when nobody has recorded whether they take one: "we did not ask"
 * is not "no". The maximum should come from an exercise test, never from
 * "220 minus age", so there is deliberately no age-based default.
 */
export function trainingHeartRate(input: {
  restingBpm: number;
  maximumBpm: number;
  intensityPercent: number;
  onBetaBlocker: boolean | null | undefined;
}): CalcResult<number> {
  const { restingBpm, maximumBpm, intensityPercent, onBetaBlocker } = input;
  if (onBetaBlocker === null || onBetaBlocker === undefined) {
    return fail("Record whether the patient takes a beta-blocker before working out a heart-rate target.");
  }
  if (onBetaBlocker) {
    return fail("On a beta-blocker a heart-rate target does not work. Use effort (0-10) and the talk test instead.");
  }
  if (!isFiniteNumber(restingBpm) || restingBpm < 30 || restingBpm > 150) return fail("Resting heart rate must be between 30 and 150.");
  if (!isFiniteNumber(maximumBpm) || maximumBpm <= restingBpm || maximumBpm > 230) {
    return fail("Maximum heart rate must be above the resting rate and no more than 230.");
  }
  if (!isFiniteNumber(intensityPercent) || intensityPercent <= 0 || intensityPercent > 100) {
    return fail("Intensity must be a percentage between 1 and 100.");
  }
  const value = Math.round(restingBpm + (maximumBpm - restingBpm) * (intensityPercent / 100));
  return {
    ok: true,
    value,
    working: `${restingBpm} + (${maximumBpm} - ${restingBpm}) x ${intensityPercent}% = ${value} bpm`,
  };
}

// --- Orthostatic blood pressure ------------------------------------------------------------

/** A drop of this much or more in the top (systolic) number is positive.
 *  To be verified by a senior physiotherapist against its source. */
export const ORTHOSTATIC_SYSTOLIC_DROP = 20;
/** ...or this much in the bottom (diastolic) number.
 *  To be verified by a senior physiotherapist against its source. */
export const ORTHOSTATIC_DIASTOLIC_DROP = 10;

export type BloodPressure = { systolic: number; diastolic: number };

export type OrthostaticResult = {
  /** Lying minus the lowest standing reading. Negative means it rose. */
  systolicDrop: number;
  diastolicDrop: number;
  positive: boolean;
};

function validPressure(bp: BloodPressure | undefined | null): bp is BloodPressure {
  return (
    !!bp &&
    isFiniteNumber(bp.systolic) &&
    isFiniteNumber(bp.diastolic) &&
    bp.systolic >= 50 &&
    bp.systolic <= 260 &&
    bp.diastolic >= 20 &&
    bp.diastolic <= 160 &&
    bp.systolic > bp.diastolic
  );
}

/** Lying for 5 minutes, then standing at 1 and at 3 minutes. Either standing
 *  reading may be missing (a patient too dizzy to stand to 3 minutes is
 *  itself a finding), but not both. A positive result is for the doctor --
 *  the profile records that a review was asked for, nothing more. */
export function orthostaticDrop(input: {
  lying: BloodPressure;
  standing1Min?: BloodPressure | null;
  standing3Min?: BloodPressure | null;
}): CalcResult<OrthostaticResult> {
  if (!validPressure(input.lying)) return fail("Enter the lying blood pressure (top number above the bottom one).");
  const standing = [input.standing1Min, input.standing3Min].filter((bp) => bp !== null && bp !== undefined);
  if (standing.length === 0) return fail("Enter at least one standing blood pressure.");
  if (!standing.every(validPressure)) return fail("A standing blood pressure is not a usable reading.");
  const lowestSystolic = Math.min(...standing.map((bp) => bp.systolic));
  const lowestDiastolic = Math.min(...standing.map((bp) => bp.diastolic));
  const systolicDrop = input.lying.systolic - lowestSystolic;
  const diastolicDrop = input.lying.diastolic - lowestDiastolic;
  const positive = systolicDrop >= ORTHOSTATIC_SYSTOLIC_DROP || diastolicDrop >= ORTHOSTATIC_DIASTOLIC_DROP;
  return {
    ok: true,
    value: { systolicDrop, diastolicDrop, positive },
    working:
      `Top number fell ${systolicDrop} (positive at ${ORTHOSTATIC_SYSTOLIC_DROP}), ` +
      `bottom number fell ${diastolicDrop} (positive at ${ORTHOSTATIC_DIASTOLIC_DROP}): ` +
      (positive ? "positive, tell the patient's doctor" : "negative"),
  };
}

// --- 30-second chair stand norms (STEADI) ---------------------------------------------------

/** Below-average if under these many full stands, by age band and sex.
 *  Check these numbers against the current CDC STEADI sheet before use --
 *  to be verified by a senior physiotherapist against its source. */
export const CHAIR_STAND_NORMS: readonly { fromAge: number; toAge: number; female: number; male: number }[] = [
  { fromAge: 60, toAge: 64, female: 12, male: 14 },
  { fromAge: 65, toAge: 69, female: 11, male: 12 },
  { fromAge: 70, toAge: 74, female: 10, male: 12 },
  { fromAge: 75, toAge: 79, female: 10, male: 11 },
  { fromAge: 80, toAge: 84, female: 9, male: 10 },
  { fromAge: 85, toAge: 89, female: 8, male: 8 },
  { fromAge: 90, toAge: 94, female: 4, male: 7 },
];

/** The row for this age and sex, or null outside the table (under 60, 95
 *  and over): no norm is not the same as a normal result. */
export function chairStandNorm(ageYears: number, sex: Sex): { ageBand: string; belowAverageUnder: number } | null {
  if (!isFiniteNumber(ageYears) || (sex !== "female" && sex !== "male")) return null;
  const age = Math.floor(ageYears);
  const row = CHAIR_STAND_NORMS.find((r) => age >= r.fromAge && age <= r.toAge);
  if (!row) return null;
  return { ageBand: `${row.fromAge}-${row.toAge}`, belowAverageUnder: row[sex] };
}

/** True when below average for age and sex; null when there is no norm to
 *  compare against. A patient who must use their arms scores 0. */
export function isChairStandBelowAverage(input: {
  stands: number;
  ageYears: number;
  sex: Sex;
  usedArms?: boolean;
}): boolean | null {
  const norm = chairStandNorm(input.ageYears, input.sex);
  if (!norm || !isFiniteNumber(input.stands)) return null;
  const score = input.usedArms ? 0 : input.stands;
  return score < norm.belowAverageUnder;
}

// --- STEADI fall-risk level --------------------------------------------------------------

/** Timed Up and Go at or above this many seconds is a higher fall risk in
 *  older adults. To be verified by a senior physiotherapist against its source. */
export const STEADI_TUG_SECONDS = 12;
/** Not holding stage 3 (heel to toe) for 10 seconds is a higher fall risk.
 *  To be verified by a senior physiotherapist against its source. */
export const STEADI_BALANCE_STAGE = 3;
/** Usual gait speed under this is linked with more falls and frailty.
 *  To be verified by a senior physiotherapist against its source. */
export const STEADI_GAIT_SPEED_MPS = 0.8;
/** The history window: falls older than this no longer decide the level. */
export const STEADI_HISTORY_DAYS = 365;

export type SteadiTestKey = "tug" | "chair_stand" | "four_stage_balance" | "gait_speed";

export type SteadiTestFinding = {
  key: SteadiTestKey;
  label: string;
  /** true: outside the safer range; false: inside it; null: not done, or no
   *  norm to judge it by. Never collapse null into false. */
  higherRisk: boolean | null;
};

const STEADI_TEST_LABELS: Record<SteadiTestKey, string> = {
  tug: "Timed Up and Go",
  chair_stand: "30-second chair stand",
  four_stage_balance: "4-stage balance",
  gait_speed: "Walking speed",
};

/** Each of the four STEADI tests judged against its own line. */
export function steadiTestFindings(input: {
  tugSeconds?: number | null;
  chairStands?: number | null;
  chairStandUsedArms?: boolean;
  ageYears?: number | null;
  sex?: Sex | null;
  /** Highest stage (1-4) held for 10 seconds; 0 if stage 1 was not held. */
  balanceStageHeld?: number | null;
  gaitSpeedMps?: number | null;
}): SteadiTestFinding[] {
  const judge = (key: SteadiTestKey, higherRisk: boolean | null): SteadiTestFinding => ({
    key,
    label: STEADI_TEST_LABELS[key],
    higherRisk,
  });
  const chair =
    isFiniteNumber(input.chairStands) && isFiniteNumber(input.ageYears) && input.sex
      ? isChairStandBelowAverage({
          stands: input.chairStands,
          ageYears: input.ageYears,
          sex: input.sex,
          usedArms: input.chairStandUsedArms,
        })
      : null;
  return [
    judge("tug", isFiniteNumber(input.tugSeconds) ? input.tugSeconds >= STEADI_TUG_SECONDS : null),
    judge("chair_stand", chair),
    judge(
      "four_stage_balance",
      isFiniteNumber(input.balanceStageHeld) ? input.balanceStageHeld < STEADI_BALANCE_STAGE : null
    ),
    judge("gait_speed", isFiniteNumber(input.gaitSpeedMps) ? input.gaitSpeedMps < STEADI_GAIT_SPEED_MPS : null),
  ];
}

export type FallRecord = { date: string; injury: boolean };

export type SteadiLevel = "low" | "moderate" | "high";

export type SteadiResult = {
  /** null when nothing decides it yet: a screen answered yes with no test
   *  done is "not yet known", never "low". */
  level: SteadiLevel | null;
  decidedBy: "fall_history" | "screen_negative" | "tests" | "not_enough_information";
  /** The rule that decided it, in words the profile prints beside the dial. */
  rule: string;
  fallsInPastYear: number;
  injuriousFallInPastYear: boolean;
  /** "Tests now in the safer range: 3 of 4", shown separately from the level
   *  so improving tests never pretend to override a fall history. */
  testsInSaferRange: { safer: number; done: number };
};

/**
 * STEADI's 2017 algorithm as the handbook states it. Two or more falls in
 * the past 12 months, or one fall with injury, puts a person in the high
 * group REGARDLESS of how well they do on the tests, until those falls are
 * more than a year old. Without that history the screen and the tests
 * decide: a negative screen is low; otherwise any test outside its safer
 * range is moderate and all tests inside it is low.
 * To be verified by a senior physiotherapist against its source.
 */
export function steadiFallRisk(input: {
  onDate: string;
  falls: readonly FallRecord[];
  screen: { fellPastYear?: boolean | null; unsteady?: boolean | null; worriesAboutFalling?: boolean | null };
  tests: readonly SteadiTestFinding[];
}): SteadiResult {
  const recent = input.falls.filter((fall) => {
    const days = daysBetween(fall.date, input.onDate);
    return days !== null && days >= 0 && days <= STEADI_HISTORY_DAYS;
  });
  const fallsInPastYear = recent.length;
  const injuriousFallInPastYear = recent.some((f) => f.injury);
  const done = input.tests.filter((t) => t.higherRisk !== null);
  const testsInSaferRange = { safer: done.filter((t) => t.higherRisk === false).length, done: done.length };
  const base = { fallsInPastYear, injuriousFallInPastYear, testsInSaferRange };

  if (fallsInPastYear >= 2 || injuriousFallInPastYear) {
    return {
      ...base,
      level: "high",
      decidedBy: "fall_history",
      rule: injuriousFallInPastYear
        ? "High: a fall with injury in the past 12 months, whatever the tests show."
        : `High: ${fallsInPastYear} falls in the past 12 months, whatever the tests show.`,
    };
  }

  const { fellPastYear, unsteady, worriesAboutFalling } = input.screen;
  const answers = [fellPastYear, unsteady, worriesAboutFalling];
  const screenPositive = answers.some((a) => a === true) || fallsInPastYear > 0;
  const screenFullyNegative = answers.every((a) => a === false) && fallsInPastYear === 0;
  if (screenFullyNegative) {
    return { ...base, level: "low", decidedBy: "screen_negative", rule: "Low: no to all three screening questions." };
  }

  if (done.length === 0) {
    return {
      ...base,
      level: null,
      decidedBy: "not_enough_information",
      rule: screenPositive
        ? "Not known yet: the screen says to do the four tests, and none is recorded."
        : "Not known yet: the screening questions are not answered and no test is recorded.",
    };
  }
  const anyHigher = done.some((t) => t.higherRisk === true);
  return {
    ...base,
    level: anyHigher ? "moderate" : "low",
    decidedBy: "tests",
    rule: anyHigher
      ? `Moderate: ${done.length - testsInSaferRange.safer} of ${done.length} tests outside the safer range.`
      : `Low: all ${done.length} tests done are in the safer range.`,
  };
}

// --- Score sheets -------------------------------------------------------------------------

export type ScoreSheetTotalRule =
  /** Add the items. */
  | "sum"
  /** Sum as a percentage of the most the ANSWERED items could score
   *  (Oswestry: sum / (5 x answered) x 100). */
  | "percent_of_answered_max"
  /** QuickDASH: ((sum / answered) - 1) x 25, items scored 1-5. */
  | "quickdash";

export type ScoreSheetSection = { key: string; label: string; itemCount: number };

export type ScoreSheet = {
  itemCount: number;
  itemMin: number;
  /** One maximum for every item, or one per item (Barthel's items differ). */
  itemMax: number | readonly number[];
  itemStep: number;
  /** How many items may be left blank before the total stops being valid.
   *  LEFS: up to two may be skipped (and asked aloud); with more missing the
   *  total is not valid. To be verified against each scale's own manual. */
  maxBlanks: number;
  totalRule: ScoreSheetTotalRule;
  /** Consecutive runs of items, in order, whose counts add up to itemCount. */
  sections?: readonly ScoreSheetSection[];
  /** Short item names, where the handbook gives them. */
  itemLabels?: readonly string[];
};

export type ScoreSheetResult =
  | {
      ok: true;
      total: number;
      /** A section with a blank in it has no subtotal (null), rather than a
       *  smaller one that reads like a worse score. */
      subtotals: Record<string, number | null>;
      answered: number;
      blanks: number;
      /** False when blanks were allowed but present: the screen says so. */
      complete: boolean;
    }
  | { ok: false; reason: "wrong_length" | "invalid_item" | "too_many_blanks" | "no_answers"; error: string };

function itemMaxAt(sheet: ScoreSheet, index: number): number {
  return typeof sheet.itemMax === "number" ? sheet.itemMax : sheet.itemMax[index];
}

/** The most a sheet can total under the "sum" rule. */
export function scoreSheetMax(sheet: ScoreSheet): number {
  let max = 0;
  for (let i = 0; i < sheet.itemCount; i += 1) max += itemMaxAt(sheet, i);
  return max;
}

/** Whether `value` is on the item's step grid from itemMin. */
function onStep(value: number, min: number, step: number): boolean {
  const steps = (value - min) / step;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

/**
 * Totals and subtotals a score sheet from its item answers (`null` is a
 * blank). Refuses a sheet of the wrong length, an item outside its range or
 * off its step, and -- the rule that matters -- more blanks than the scale
 * allows: a total built from too few answers is not that scale's total.
 */
export function scoreSheetTotal(sheet: ScoreSheet, answers: readonly (number | null)[]): ScoreSheetResult {
  if (!Array.isArray(answers) || answers.length !== sheet.itemCount) {
    return { ok: false, reason: "wrong_length", error: `This sheet has ${sheet.itemCount} items.` };
  }
  let sum = 0;
  let answered = 0;
  for (let i = 0; i < answers.length; i += 1) {
    const a = answers[i];
    if (a === null) continue;
    const max = itemMaxAt(sheet, i);
    if (!isFiniteNumber(a) || a < sheet.itemMin || a > max || !onStep(a, sheet.itemMin, sheet.itemStep)) {
      return {
        ok: false,
        reason: "invalid_item",
        error: `Item ${i + 1} must be from ${sheet.itemMin} to ${max} in steps of ${sheet.itemStep}.`,
      };
    }
    sum += a;
    answered += 1;
  }
  const blanks = sheet.itemCount - answered;
  if (answered === 0) return { ok: false, reason: "no_answers", error: "No item is answered." };
  if (blanks > sheet.maxBlanks) {
    return {
      ok: false,
      reason: "too_many_blanks",
      error:
        sheet.maxBlanks === 0
          ? "Every item must be answered for the total to be valid."
          : `${blanks} items are blank; with more than ${sheet.maxBlanks} missing the total is not valid.`,
    };
  }

  let total: number;
  if (sheet.totalRule === "sum") {
    total = sum;
  } else if (sheet.totalRule === "percent_of_answered_max") {
    let answeredMax = 0;
    answers.forEach((a, i) => {
      if (a !== null) answeredMax += itemMaxAt(sheet, i);
    });
    total = roundTo((sum / answeredMax) * 100, 1);
  } else {
    total = roundTo((sum / answered - 1) * 25, 1);
  }

  const subtotals: Record<string, number | null> = {};
  let cursor = 0;
  for (const section of sheet.sections ?? []) {
    const slice = answers.slice(cursor, cursor + section.itemCount);
    cursor += section.itemCount;
    subtotals[section.key] = slice.some((a) => a === null) ? null : slice.reduce<number>((s, a) => s + (a ?? 0), 0);
  }
  return { ok: true, total, subtotals, answered, blanks, complete: blanks === 0 };
}
