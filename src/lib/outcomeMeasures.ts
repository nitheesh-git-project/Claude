import type { ConditionSpecialty } from "@/lib/conditionSpecialty";
import {
  ORTHOSTATIC_SYSTOLIC_DROP,
  STEADI_BALANCE_STAGE,
  STEADI_GAIT_SPEED_MPS,
  STEADI_TUG_SECONDS,
  averageOfTrials,
  bestOfTrials,
  chairStandNorm,
  medianOfTrials,
  orthostaticDrop,
  roundTo,
  scoreSheetTotal,
  type ScoreSheet,
  type Sex,
} from "@/lib/clinicalCalculators";

// The outcome measures: every standardised test the six Health Profiles can
// record, with its unit, range, which direction is better, how big a change
// has to be to be real, its cut-offs and norms, its licence and whether it
// can be done over video. Everything else -- the "Record a test" dialog, the
// route that stores a measurement, the progress graph, the status pill and
// the milestone maths -- reads from this one table.
//
// Dependency-free on purpose (the "business maths lives in src/lib" rule):
// the route validates a measurement with exactly the table the dialog
// renders from, so a value the screen cannot offer is a value the server
// refuses, and the tests can reason about all of it without a browser.
//
// Stored in `outcome_measurements` (schema.sql), ONE shared append-only
// table for every condition type -- a re-test is a new row, never an edit,
// which is what lets a graph say what changed. Four layers stay as they are
// and this module only POINTS at them, never copies them:
//
//   - The Pain Map (`pain_assessments`, painMap.ts) is orthopaedic-only and
//     owns the 0-10 pain score; `pain_nprs` is `source: "pain_map"`.
//   - The neurological exam (`neuro_assessments`, neuroExam.ts) owns the Berg
//     Balance Scale and its item scores, the Modified Ashworth and Oxford/MRC
//     grades, the reflexes, and the 10-metre walk and Timed Up and Go for a
//     neurological patient. Those entries carry `neuroExam` so a graph can
//     read them from there, and `measurementSource()` refuses to have them
//     written twice.
//   - The paediatric exam (`peds_assessments`, pedsExam.ts) owns the WHO
//     motor milestones (status, date first seen, seen or parent-reported)
//     and the GMFCS level: `who_motor_milestone` and `gmfcs` are
//     `source: "peds_exam"`. The two timed counts, standing time and
//     independent steps, stay HERE (three tries, the best kept, linked from
//     the starter milestones) and the exam refuses them -- one owner each.
//
// "Parkinson's" is NOT a condition type. It is a sub-profile inside the
// existing `neuro` specialty (`neuro_parkinsons` below); "Strength and
// balance care" (geriatric) and "Heart and lung rehabilitation"
// (cardiopulmonary) become condition types in a later phase. The registry
// can already refer to all six profile kinds so the measures and the
// milestone templates do not have to be rewritten when they arrive.
//
// THRESHOLDS: every range, real-change value, cut-off and norm below is
// copied from the clinic's Health Profile Assessment Handbook (draft for
// clinical review, 12 Oct 2026). Every one is TO BE VERIFIED BY A SENIOR
// PHYSIOTHERAPIST AGAINST ITS SOURCE before it is shown to a patient, and
// every licence marked "licensed" must be confirmed by the clinic before the
// measure is switched on. Nothing here turns a score into a diagnosis: a
// cut-off means "higher risk", never "will fall".

export const OUTCOME_MEASURES_VERSION = 1;

// --- Profile kinds ------------------------------------------------------------

export type ProfileKind = "ortho" | "neuro" | "neuro_parkinsons" | "pediatrics" | "geriatric" | "cardiopulmonary";

export const PROFILE_KINDS: readonly ProfileKind[] = [
  "ortho",
  "neuro",
  "neuro_parkinsons",
  "pediatrics",
  "geriatric",
  "cardiopulmonary",
];

/** Clinician word and patient word, per the "one word for the record" rule
 *  in docs/rules/clinical.md: the patient is shown the care, never a
 *  category word. The geriatric and cardiopulmonary names are the ones the
 *  owner chose for the later condition types. */
export const PROFILE_KIND_LABELS: Record<ProfileKind, { label: string; patientLabel: string }> = {
  ortho: { label: "Orthopaedic", patientLabel: "Orthopaedic care" },
  neuro: { label: "Neurological", patientLabel: "Neurological care" },
  neuro_parkinsons: { label: "Neurological: Parkinson's", patientLabel: "Parkinson's care" },
  pediatrics: { label: "Paediatric", patientLabel: "Paediatric physiotherapy" },
  geriatric: { label: "Strength and balance care", patientLabel: "Strength and balance care" },
  cardiopulmonary: { label: "Heart and lung rehabilitation", patientLabel: "Heart and lung rehabilitation" },
};

export function isProfileKind(value: unknown): value is ProfileKind {
  return typeof value === "string" && (PROFILE_KINDS as readonly string[]).includes(value);
}

/** Which profile kinds a recorded condition type can carry today. A
 *  Parkinson's patient is a neurological patient whose profile is the
 *  Parkinson's sub-profile; geriatric and cardiopulmonary have no condition
 *  type yet, so no specialty maps to them. */
export function profileKindsForSpecialty(specialty: ConditionSpecialty): readonly ProfileKind[] {
  if (specialty === "neuro") return ["neuro", "neuro_parkinsons"];
  if (specialty === "pediatrics") return ["pediatrics"];
  return ["ortho"];
}

// --- The shape of a measure ------------------------------------------------------

/** "toward_normal": joint range, judged by distance from the usual value.
 *  "hold": a stage that physiotherapy cannot change (Hoehn and Yahr) or a
 *  classification (GMFCS) -- context, never a goal. "earlier": the age a
 *  milestone was reached. */
export type BetterDirection = "higher" | "lower" | "toward_normal" | "hold" | "earlier";

export type MeasureLicence = "free" | "free_with_attribution" | "licensed";

/** Where the test may be done: "estimate" is labelled an estimate on the
 *  graph; "with_helper" needs another adult beside the patient over video;
 *  "home_measured" / "home_device" mark the reading as taken at home. */
export type VideoUse = "yes" | "no" | "estimate" | "with_helper" | "home_measured" | "home_device" | "with_parent";

/** Which table a measure's readings live in. */
export type MeasureSource = "outcome_measurements" | "neuro_exam" | "pain_map" | "peds_exam";

/** How the number is produced, which decides the dialog's tool. */
export type MeasureCapture = "single" | "trials" | "score_sheet" | "rating" | "diary" | "calculated";

export type TrialRule = {
  count: number;
  keep: "best" | "average" | "median";
  /** Practice trials before the timed ones, not recorded. */
  practice?: number;
  note?: string;
};

export type RealChange = {
  /** The figure the maths uses. Where the handbook gives a range, the
   *  conservative end (the larger change), so a small move is never called
   *  real on the strength of the optimistic figure. */
  value: number;
  range?: readonly [number, number];
  /** A wider allowance when two different testers measured. */
  betweenTesters?: number;
  note?: string;
};

export type CutOffComparison = "at_or_above" | "above" | "at_or_below" | "below";

export type CutOff =
  | {
      type: "fixed";
      comparison: CutOffComparison;
      value: number;
      level: "higher_risk" | "very_high_risk";
      label: string;
      /** Absent: applies to every profile kind the measure is used in. */
      profileKinds?: readonly ProfileKind[];
    }
  | {
      /** The patient's own limit set on their profile (lowest SpO2). */
      type: "patient_limit";
      comparison: CutOffComparison;
      label: string;
      profileKinds?: readonly ProfileKind[];
    }
  | {
      /** An age-and-sex table (the 30-second chair stand). */
      type: "age_sex_norm";
      label: string;
      profileKinds?: readonly ProfileKind[];
    };

/** A descriptive band: the last band whose `min` is at or below the value. */
export type Band = { min: number; label: string };

export type Grade = { value: number; label: string };

export type Norm = {
  kind: "fixed" | "age_sex_table" | "predicted_equation" | "other_side" | "who_window" | "usual_range";
  value?: number;
  label: string;
};

export type Variant = { key: string; label: string };

/** The neurological-exam field a measure reads from, for the kinds where
 *  the exam owns it. */
export type NeuroExamField = "balance.bergTotal" | "gait.tugSeconds" | "gait.tenMetreWalkSeconds" | "bilateral.tone";

export type OutcomeMeasure = {
  key: string;
  /** The test's own name, as a clinician cites it. */
  label: string;
  /** The same thing in a patient's words. */
  plainName: string;
  unit: string;
  min: number;
  max: number;
  /** Decimal places a value is stored to. */
  decimals: number;
  /** When set, the only values allowed (Hoehn and Yahr's 1, 1.5, 2...). */
  grades?: readonly Grade[];
  /** Values must sit on this step from `min` (Barthel moves in fives). */
  step?: number;
  better: BetterDirection;
  mdc?: RealChange;
  mcid?: RealChange;
  /** Per-kind overrides where the handbook gives a population-specific
   *  figure (TUG in Parkinson's). */
  mdcByKind?: Partial<Record<ProfileKind, RealChange>>;
  mcidByKind?: Partial<Record<ProfileKind, RealChange>>;
  cutOffs?: readonly CutOff[];
  bands?: readonly Band[];
  norm?: Norm;
  licence: MeasureLicence;
  /** Free measures are on; a licensed one stays off until an admin confirms
   *  the clinic holds the licence. */
  enabledByDefault: boolean;
  videoUse: VideoUse;
  profileKinds: readonly ProfileKind[];
  source: MeasureSource;
  neuroExam?: { field: NeuroExamField; ownsFor: readonly ProfileKind[] };
  capture: MeasureCapture;
  trials?: TrialRule;
  scoreSheet?: ScoreSheet;
  /** Named raw readings stored in `items` as an object, and the function
   *  that derives the stored value from them -- so a stored value can always
   *  be re-checked against what was measured. Required when declared. */
  readings?: { keys: readonly string[]; derive: (r: Readonly<Record<string, number>>) => number | null };
  /** Recorded per side (left / right). */
  sided?: boolean;
  /** A measure recorded in several distinct ways that must never share a
   *  line (knee flexion vs extension, active vs passive; breathlessness at
   *  rest vs after the walk). */
  variants?: readonly Variant[];
  /** For a Parkinson's sub-profile: ON/OFF and the last dose time are
   *  required, and the graph only joins dots recorded in the same state. */
  medicationStateRequired?: boolean;
  /** A classification or a clinic-own rating rather than a validated
   *  progress score; the screen labels it so. */
  classification?: boolean;
  clinicOwnRating?: boolean;
  /** The CDC chair-stand rule: a stand that needs the arms scores 0. When
   *  `conditions.usedArms` is true the value must be 0 and the stands done
   *  with the arms travel in `items` as `{ standsWithArms }` (see
   *  validateUsedArms). Only a measure carrying this may say usedArms. */
  usedArmsScoresZero?: boolean;
  /** Reviewer notes that travel with the entry. */
  note?: string;
};

// --- Shared tables ---------------------------------------------------------------

/** Usual ranges of movement, in degrees, from the handbook's table.
 *  Usual ranges vary between textbooks and fall with age; the patient's own
 *  other side is the best normal. To be verified by a senior
 *  physiotherapist against its source. */
export const JOINT_MOVEMENTS: readonly { key: string; label: string; usualDegrees: number }[] = [
  { key: "shoulder_flexion", label: "Shoulder flexion", usualDegrees: 180 },
  { key: "shoulder_abduction", label: "Shoulder abduction", usualDegrees: 180 },
  { key: "shoulder_external_rotation", label: "Shoulder rotation out", usualDegrees: 90 },
  { key: "shoulder_internal_rotation", label: "Shoulder rotation in", usualDegrees: 70 },
  { key: "elbow_flexion", label: "Elbow flexion", usualDegrees: 150 },
  { key: "wrist_flexion", label: "Wrist flexion", usualDegrees: 80 },
  { key: "wrist_extension", label: "Wrist extension", usualDegrees: 70 },
  { key: "hip_flexion", label: "Hip flexion", usualDegrees: 120 },
  { key: "hip_abduction", label: "Hip abduction", usualDegrees: 45 },
  { key: "hip_internal_rotation", label: "Hip rotation in", usualDegrees: 45 },
  { key: "hip_external_rotation", label: "Hip rotation out", usualDegrees: 45 },
  { key: "knee_flexion", label: "Knee bend", usualDegrees: 135 },
  // A straight knee reads 0; short of straight is negative (-8 is 8 short).
  { key: "knee_extension", label: "Knee straightening", usualDegrees: 0 },
  { key: "ankle_dorsiflexion", label: "Ankle up (dorsiflexion)", usualDegrees: 20 },
  { key: "ankle_plantarflexion", label: "Ankle down (plantarflexion)", usualDegrees: 50 },
  { key: "neck_rotation", label: "Neck rotation", usualDegrees: 80 },
];

/** Active and passive range never share a line: keep to the same one. */
const JOINT_RANGE_VARIANTS: readonly Variant[] = JOINT_MOVEMENTS.flatMap((m) => [
  { key: `${m.key}_active`, label: `${m.label} (active)` },
  { key: `${m.key}_passive`, label: `${m.label} (passive)` },
]);

/** The usual value a joint-range variant is judged toward, or null. */
export function usualJointRange(variantKey: string): number | null {
  const movement = JOINT_MOVEMENTS.find((m) => variantKey === `${m.key}_active` || variantKey === `${m.key}_passive`);
  return movement ? movement.usualDegrees : null;
}

/** WHO Motor Development Study windows (1st to 99th percentile), in months,
 *  and what counts as reached. To be verified by a senior physiotherapist
 *  against its source. */
export const WHO_MOTOR_MILESTONES: readonly {
  key: string;
  label: string;
  windowMonths: readonly [number, number];
  reachedWhen: string;
}[] = [
  {
    key: "sitting_without_support",
    label: "Sitting without support",
    windowMonths: [3.8, 9.2],
    reachedWhen: "Sits up straight, head steady, for at least 10 seconds without using hands",
  },
  {
    key: "hands_knees_crawling",
    label: "Hands-and-knees crawling",
    windowMonths: [5.2, 13.5],
    reachedWhen: "Moves forward or back on hands and knees, tummy off the floor, at least three movements in a row",
  },
  {
    key: "standing_with_help",
    label: "Standing with help",
    windowMonths: [4.8, 11.4],
    reachedWhen: "Stands on both feet holding a stable object with both hands, without leaning on it, for at least 10 seconds",
  },
  {
    key: "walking_with_help",
    label: "Walking with help",
    windowMonths: [5.9, 13.7],
    reachedWhen: "Takes sideways or forward steps while holding a stable object",
  },
  {
    key: "standing_alone",
    label: "Standing alone",
    windowMonths: [6.9, 16.9],
    reachedWhen: "Stands on both feet, not touching anyone or anything, for at least 10 seconds",
  },
  {
    key: "walking_alone",
    label: "Walking alone",
    windowMonths: [8.2, 17.6],
    reachedWhen: "Takes at least five steps on their own, upright",
  },
];

/** Where a milestone reached at `correctedMonths` sits against its window. */
export function whoWindowPosition(milestoneKey: string, correctedMonths: number): "before" | "within" | "after" | null {
  const m = WHO_MOTOR_MILESTONES.find((x) => x.key === milestoneKey);
  if (!m || !Number.isFinite(correctedMonths)) return null;
  if (correctedMonths < m.windowMonths[0]) return "before";
  if (correctedMonths > m.windowMonths[1]) return "after";
  return "within";
}

const HOEHN_YAHR_GRADES: readonly Grade[] = [
  { value: 1, label: "1: one side of the body only" },
  { value: 1.5, label: "1.5: one side, plus the trunk or neck" },
  { value: 2, label: "2: both sides, balance not affected" },
  { value: 2.5, label: "2.5: both sides, mild; recovers on the pull test" },
  { value: 3, label: "3: both sides, some loss of balance; physically independent" },
  { value: 4, label: "4: severe disability; can still walk or stand without help" },
  { value: 5, label: "5: wheelchair or bed unless helped" },
];

const FAC_GRADES: readonly Grade[] = [
  { value: 0, label: "0: cannot walk, or needs two people" },
  { value: 1, label: "1: needs continuous support from one person" },
  { value: 2, label: "2: needs intermittent help or light touch from one person" },
  { value: 3, label: "3: needs someone close by for supervision, no touch" },
  { value: 4, label: "4: independent on level ground; help on stairs, slopes or uneven ground" },
  { value: 5, label: "5: independent anywhere" },
];

const MMRC_GRADES: readonly Grade[] = [
  { value: 0, label: "0: breathless only with strenuous exercise" },
  { value: 1, label: "1: when hurrying or walking up a slight hill" },
  { value: 2, label: "2: walks slower than others of the same age, or stops at own pace" },
  { value: 3, label: "3: stops for breath after about 100 m or a few minutes on the level" },
  { value: 4, label: "4: too breathless to leave the house, or when dressing" },
];

const FOUR_STAGE_GRADES: readonly Grade[] = [
  // 0 is this module's addition: the handbook's scale is stages 1-4, and a
  // patient who cannot hold stage 1 needs a value that is not "stage 1".
  { value: 0, label: "Could not hold stage 1" },
  { value: 1, label: "Stage 1: feet side by side" },
  { value: 2, label: "Stage 2: instep against the big toe" },
  { value: 3, label: "Stage 3: heel to toe" },
  { value: 4, label: "Stage 4: standing on one leg" },
];

const GMFCS_GRADES: readonly Grade[] = [1, 2, 3, 4, 5].map((v) => ({ value: v, label: `Level ${["I", "II", "III", "IV", "V"][v - 1]}` }));

const ALL_ADULT_FALLS: readonly ProfileKind[] = ["neuro", "neuro_parkinsons", "geriatric"];

// --- The registry ----------------------------------------------------------------
//
// Order follows the handbook's "All measures at a glance" table, then the
// measures it describes but leaves out of that table, then the licensed
// scales (all off by default).

export const OUTCOME_MEASURES: readonly OutcomeMeasure[] = [
  // ---- Orthopaedic -------------------------------------------------------------
  {
    key: "pain_nprs",
    label: "Numeric Pain Rating Scale",
    plainName: "Pain score",
    unit: "0-10",
    min: 0,
    max: 10,
    decimals: 0,
    better: "lower",
    // About 2 points, or about 30%, is what most patients call meaningful.
    // To be verified by a senior physiotherapist against its source.
    mcid: { value: 2, note: "or about 30%" },
    bands: [
      { min: 0, label: "Mild (under 4)" },
      { min: 4, label: "Moderate (4 to 6)" },
      { min: 7, label: "Severe (7 and over)" },
    ],
    licence: "free",
    enabledByDefault: true,
    videoUse: "yes",
    profileKinds: ["ortho"],
    // The Pain Map owns pain, stored 0-100 per region and printed through
    // formatPainOutOfTen(). Nothing is written here.
    source: "pain_map",
    capture: "rating",
    variants: [
      { key: "now", label: "Right now" },
      { key: "worst_24h", label: "Worst in the last 24 hours" },
      { key: "best_24h", label: "Best in the last 24 hours" },
    ],
  },
  {
    key: "joint_range",
    label: "Goniometry",
    plainName: "How far a joint moves",
    unit: "degrees",
    min: -90,
    max: 200,
    decimals: 0,
    better: "toward_normal",
    // Same tester: under about 5 degrees can be error; different testers
    // allow about 10. To be verified by a senior physiotherapist against its source.
    mdc: { value: 5, betweenTesters: 10 },
    norm: { kind: "other_side", label: "The other side first; then the usual range for the movement" },
    licence: "free",
    enabledByDefault: true,
    videoUse: "estimate",
    profileKinds: ["ortho"],
    source: "outcome_measurements",
    capture: "trials",
    trials: { count: 2, keep: "median", note: "If two readings differ by more than 5 degrees, take a third and keep the middle one." },
    sided: true,
    variants: JOINT_RANGE_VARIANTS,
  },
  {
    key: "strength_symmetry",
    label: "Limb symmetry index (handheld dynamometer)",
    plainName: "Strength compared with the other side",
    unit: "%",
    min: 0,
    max: 200,
    decimals: 1,
    better: "higher",
    // 90% is the common target before running, jumping or sport.
    // To be verified by a senior physiotherapist against its source.
    norm: { kind: "fixed", value: 90, label: "90% of the other side before running or sport" },
    licence: "free",
    enabledByDefault: true,
    videoUse: "no",
    profileKinds: ["ortho"],
    source: "outcome_measurements",
    capture: "calculated",
    trials: { count: 3, keep: "average", practice: 1, note: "Three maximal pushes of about 5 seconds, 30 seconds apart, each side." },
    sided: true,
    variants: [
      { key: "quadriceps", label: "Thigh, front (quadriceps)" },
      { key: "hamstrings", label: "Thigh, back (hamstrings)" },
      { key: "hip_abductors", label: "Hip, side (abductors)" },
      { key: "calf", label: "Calf" },
      { key: "shoulder_external_rotators", label: "Shoulder rotators" },
      { key: "grip", label: "Grip" },
    ],
  },
  {
    key: "lefs",
    label: "Lower Extremity Functional Scale",
    plainName: "Everyday tasks with your legs",
    unit: "0-80",
    min: 0,
    max: 80,
    decimals: 0,
    better: "higher",
    // To be verified by a senior physiotherapist against its source.
    mcid: { value: 9 },
    licence: "free",
    enabledByDefault: true,
    videoUse: "yes",
    profileKinds: ["ortho"],
    source: "outcome_measurements",
    capture: "score_sheet",
    // Up to two items may be skipped (the physiotherapist asks them aloud);
    // with more missing the total is not valid.
    scoreSheet: { itemCount: 20, itemMin: 0, itemMax: 4, itemStep: 1, maxBlanks: 2, totalRule: "sum" },
  },
  {
    key: "koos12",
    label: "KOOS-12",
    plainName: "Knee questionnaire",
    unit: "0-100",
    min: 0,
    max: 100,
    decimals: 1,
    better: "higher",
    // About 8-10. To be verified by a senior physiotherapist against its source.
    mcid: { value: 10, range: [8, 10] },
    licence: "free",
    enabledByDefault: true,
    videoUse: "yes",
    profileKinds: ["ortho"],
    source: "outcome_measurements",
    capture: "score_sheet",
    note: "Subscales are converted to 0-100, so the score is entered, not summed here.",
  },

  // ---- Neurological -----------------------------------------------------------
  {
    key: "barthel",
    label: "Barthel Index",
    plainName: "Independence in daily activities",
    unit: "0-100",
    min: 0,
    max: 100,
    decimals: 0,
    step: 5,
    better: "higher",
    // To be verified by a senior physiotherapist against its source.
    mcid: { value: 10 },
    bands: [
      { min: 0, label: "Total dependence (0-20)" },
      { min: 21, label: "Severe dependence (21-60)" },
      { min: 61, label: "Moderate dependence (61-90)" },
      { min: 91, label: "Slight dependence (91-99)" },
      { min: 100, label: "Independent (100)" },
    ],
    // "Check licence for commercial software" -- off until confirmed.
    licence: "licensed",
    enabledByDefault: false,
    videoUse: "yes",
    profileKinds: ["neuro", "geriatric"],
    source: "outcome_measurements",
    capture: "score_sheet",
    scoreSheet: {
      itemCount: 10,
      itemMin: 0,
      itemMax: [10, 5, 5, 10, 10, 10, 10, 15, 15, 10],
      itemStep: 5,
      maxBlanks: 0,
      totalRule: "sum",
      itemLabels: [
        "Feeding",
        "Bathing",
        "Grooming",
        "Dressing",
        "Bowels",
        "Bladder",
        "Toilet use",
        "Bed to chair transfer",
        "Walking on level ground",
        "Stairs",
      ],
    },
  },
  {
    key: "berg_balance",
    label: "Berg Balance Scale",
    plainName: "Balance",
    unit: "0-56",
    min: 0,
    max: 56,
    decimals: 0,
    better: "higher",
    // After stroke, about 5 to 7 points is beyond measurement error.
    // To be verified by a senior physiotherapist against its source.
    mdc: { value: 7, range: [5, 7] },
    cutOffs: [
      // To be verified by a senior physiotherapist against its source. NOTE:
      // neuroExam.ts's own bands (0-20 / 21-40 / 41-56, bergRiskBand) differ
      // from the handbook's 45 line; a reviewer should settle which one the
      // graph draws.
      { type: "fixed", comparison: "at_or_below", value: 45, level: "higher_risk", label: "Higher risk of falling (45 or below)" },
      { type: "fixed", comparison: "below", value: 40, level: "very_high_risk", label: "Very high risk of falling (under 40)" },
    ],
    licence: "free",
    enabledByDefault: true,
    videoUse: "no",
    profileKinds: ["neuro"],
    // The neurological exam owns the Berg total and its fourteen item
    // scores (bergTotalFromItems). Nothing is written here.
    source: "neuro_exam",
    neuroExam: { field: "balance.bergTotal", ownsFor: ["neuro"] },
    capture: "score_sheet",
    note: "Once someone scores 50 or more, switch to the Mini-BESTest to keep seeing change.",
  },
  {
    key: "ten_metre_walk",
    label: "10-metre walk test",
    plainName: "Walking speed",
    unit: "m/s",
    min: 0.05,
    max: 3,
    decimals: 2,
    better: "higher",
    // After stroke, about 0.16 m/s is meaningful.
    // To be verified by a senior physiotherapist against its source.
    mcidByKind: { neuro: { value: 0.16, note: "after stroke" } },
    bands: [
      // Same lines as neuroExam.gaitSpeedBand(). To be verified by a senior
      // physiotherapist against its source.
      { min: 0, label: "Mostly around the house (under 0.4 m/s)" },
      { min: 0.4, label: "Short trips outside (0.4-0.8 m/s)" },
      { min: 0.8, label: "Around the neighbourhood (0.8 m/s or more)" },
    ],
    licence: "free",
    enabledByDefault: true,
    videoUse: "home_measured",
    profileKinds: ["neuro", "neuro_parkinsons"],
    source: "outcome_measurements",
    // A neurological patient's walk time is on their exam (seconds, which
    // gaitSpeedFromTenMetre converts); the Parkinson's sub-profile records
    // it here, with ON/OFF and three averaged trials.
    neuroExam: { field: "gait.tenMetreWalkSeconds", ownsFor: ["neuro"] },
    capture: "trials",
    trials: { count: 3, keep: "average", note: "Time the middle 10 m of a 14 m path; speed = 10 / seconds." },
    medicationStateRequired: true,
  },
  {
    key: "tug",
    label: "Timed Up and Go",
    plainName: "Stand, walk 3 metres and sit",
    unit: "seconds",
    min: 1,
    max: 300,
    decimals: 1,
    better: "lower",
    // Single-trial TUG varies a lot in Parkinson's; one study put the
    // smallest real change at about 3.5 s.
    // To be verified by a senior physiotherapist against its source.
    mdcByKind: { neuro_parkinsons: { value: 3.5, note: "average of three trials" } },
    cutOffs: [
      // To be verified by a senior physiotherapist against its source. NOTE:
      // neuroExam.ts uses 13.5 s (TUG_FALL_RISK_SECONDS) for its own chart.
      { type: "fixed", comparison: "at_or_above", value: 14, level: "higher_risk", label: "Higher fall risk after stroke (14 s or more)", profileKinds: ["neuro"] },
      { type: "fixed", comparison: "above", value: 11.5, level: "higher_risk", label: "Higher fall risk in Parkinson's (over 11.5 s)", profileKinds: ["neuro_parkinsons"] },
      { type: "fixed", comparison: "at_or_above", value: STEADI_TUG_SECONDS, level: "higher_risk", label: "Higher fall risk (12 s or more)", profileKinds: ["geriatric"] },
    ],
    licence: "free",
    enabledByDefault: true,
    videoUse: "with_helper",
    profileKinds: ALL_ADULT_FALLS,
    source: "outcome_measurements",
    neuroExam: { field: "gait.tugSeconds", ownsFor: ["neuro"] },
    capture: "trials",
    trials: { count: 3, keep: "average", practice: 1 },
    medicationStateRequired: true,
  },
  {
    key: "fugl_meyer_ue",
    label: "Fugl-Meyer Assessment, upper limb",
    plainName: "Arm and hand movement",
    unit: "0-66",
    min: 0,
    max: 66,
    decimals: 0,
    better: "higher",
    // About 5 to 7 in longer-term stroke.
    // To be verified by a senior physiotherapist against its source.
    mcid: { value: 7, range: [5, 7] },
    licence: "free",
    enabledByDefault: true,
    videoUse: "no",
    profileKinds: ["neuro"],
    source: "outcome_measurements",
    capture: "score_sheet",
    sided: true,
    scoreSheet: {
      itemCount: 33,
      itemMin: 0,
      itemMax: 2,
      itemStep: 1,
      maxBlanks: 0,
      totalRule: "sum",
      sections: [
        { key: "shoulder_elbow_forearm", label: "Shoulder, elbow and forearm", itemCount: 18 },
        { key: "wrist", label: "Wrist", itemCount: 5 },
        { key: "hand", label: "Hand", itemCount: 7 },
        { key: "coordination_speed", label: "Coordination and speed", itemCount: 3 },
      ],
    },
    note: "Needs a trained tester; scores vary between untrained testers.",
  },
  {
    key: "modified_ashworth",
    label: "Modified Ashworth Scale",
    plainName: "Muscle stiffness",
    unit: "grade",
    // The exam stores "0, 1, 1+, 2, 3, 4" as strings ("1+" is never 1.5);
    // this range is neuroExam's severity index (0-5), read for graphing only.
    min: 0,
    max: 5,
    decimals: 0,
    better: "lower",
    mcid: { value: 1, note: "one grade" },
    licence: "free",
    enabledByDefault: true,
    videoUse: "no",
    profileKinds: ["neuro"],
    source: "neuro_exam",
    neuroExam: { field: "bilateral.tone", ownsFor: ["neuro"] },
    capture: "rating",
    sided: true,
  },
  {
    key: "fac",
    label: "Functional Ambulation Categories",
    plainName: "How much help to walk",
    unit: "0-5",
    min: 0,
    max: 5,
    decimals: 0,
    grades: FAC_GRADES,
    better: "higher",
    mcid: { value: 1, note: "one level" },
    licence: "free",
    enabledByDefault: true,
    videoUse: "yes",
    profileKinds: ["neuro"],
    source: "outcome_measurements",
    capture: "rating",
    note: "FAC does not include the walking aid; record it in the conditions.",
  },

  // ---- Paediatric ---------------------------------------------------------------
  {
    key: "who_motor_milestone",
    label: "WHO motor milestone",
    plainName: "Movement milestone reached",
    unit: "months (corrected age)",
    min: 0,
    max: 36,
    decimals: 1,
    better: "earlier",
    norm: { kind: "who_window", label: "WHO Motor Development Study window" },
    licence: "free",
    enabledByDefault: true,
    videoUse: "with_parent",
    profileKinds: ["pediatrics"],
    // The paediatric exam owns it (pedsExam.ts): a milestone is not yet /
    // emerging / achieved with the date first seen and seen or reported,
    // which one number cannot hold; the age it came at is derived from that
    // date and the corrected age (pedsMilestoneWindows.ts).
    source: "peds_exam",
    capture: "single",
    variants: WHO_MOTOR_MILESTONES.map((m) => ({ key: m.key, label: m.label })),
    note: "Recorded in the paediatric examination: the date first seen and seen or parent-reported; the corrected age is worked out from it.",
  },
  {
    // The count of the six WHO milestones recorded as achieved, as at each
    // paediatric examination (pedsProfile.ts builds the line from the exams;
    // a milestone achieved stays counted until a later exam finds otherwise).
    // Derived, so the exam owns it and the measurement route refuses it, and
    // it carries no threshold or norm: more is further along, nothing says
    // how many a child "should" have without an age.
    key: "peds_milestones_achieved",
    label: "Movement milestones achieved",
    plainName: "Movement milestones reached",
    unit: "of 6",
    min: 0,
    max: 6,
    decimals: 0,
    better: "higher",
    licence: "free",
    enabledByDefault: true,
    videoUse: "with_parent",
    profileKinds: ["pediatrics"],
    source: "peds_exam",
    capture: "calculated",
    note: "Worked out from the paediatric examinations; the six milestones are recorded there.",
  },
  {
    key: "peds_standing_seconds",
    label: "Independent standing time",
    plainName: "Standing without holding on",
    unit: "seconds",
    min: 0,
    max: 600,
    decimals: 0,
    better: "higher",
    licence: "free",
    enabledByDefault: true,
    videoUse: "yes",
    profileKinds: ["pediatrics"],
    source: "outcome_measurements",
    capture: "trials",
    trials: { count: 3, keep: "best" },
  },
  {
    key: "peds_independent_steps",
    label: "Independent steps",
    plainName: "Steps without holding on",
    unit: "steps",
    min: 0,
    max: 500,
    decimals: 0,
    better: "higher",
    // Five independent steps is the WHO line for walking alone.
    norm: { kind: "fixed", value: 5, label: "5 steps counts as walking alone (WHO)" },
    licence: "free",
    enabledByDefault: true,
    videoUse: "yes",
    profileKinds: ["pediatrics"],
    source: "outcome_measurements",
    capture: "trials",
    trials: { count: 3, keep: "best" },
  },

  // ---- Parkinson's (a neuro sub-profile) -----------------------------------------
  {
    key: "hoehn_yahr",
    label: "Modified Hoehn and Yahr",
    plainName: "Stage",
    unit: "stage 1-5",
    min: 1,
    max: 5,
    decimals: 1,
    grades: HOEHN_YAHR_GRADES,
    // Physiotherapy cannot change the stage: it is context, never a goal.
    better: "hold",
    licence: "free",
    enabledByDefault: true,
    videoUse: "no",
    profileKinds: ["neuro_parkinsons"],
    source: "outcome_measurements",
    capture: "rating",
    classification: true,
    medicationStateRequired: true,
  },
  {
    key: "five_sit_to_stand",
    label: "Five times sit-to-stand",
    plainName: "Five stands from a chair",
    unit: "seconds",
    min: 1,
    max: 300,
    decimals: 1,
    better: "lower",
    cutOffs: [
      // To be verified by a senior physiotherapist against its source.
      { type: "fixed", comparison: "above", value: 16, level: "higher_risk", label: "Higher fall risk in Parkinson's (over 16 s)" },
    ],
    licence: "free",
    enabledByDefault: true,
    videoUse: "with_helper",
    profileKinds: ["neuro_parkinsons"],
    source: "outcome_measurements",
    capture: "trials",
    trials: { count: 1, keep: "best" },
    medicationStateRequired: true,
  },
  {
    key: "mini_bestest",
    label: "Mini-BESTest",
    plainName: "Balance (harder test)",
    unit: "0-28",
    min: 0,
    max: 28,
    decimals: 0,
    better: "higher",
    // To be verified by a senior physiotherapist against its source.
    mcid: { value: 4 },
    cutOffs: [
      // "Around 19-20 or below": the upper end, so the line flags rather
      // than misses. To be verified by a senior physiotherapist against its source.
      { type: "fixed", comparison: "at_or_below", value: 20, level: "higher_risk", label: "Higher fall risk in Parkinson's (about 20 or below)", profileKinds: ["neuro_parkinsons"] },
    ],
    licence: "free",
    enabledByDefault: true,
    videoUse: "no",
    profileKinds: ["neuro_parkinsons", "neuro"],
    source: "outcome_measurements",
    capture: "score_sheet",
    scoreSheet: {
      itemCount: 14,
      itemMin: 0,
      itemMax: 2,
      itemStep: 1,
      maxBlanks: 0,
      totalRule: "sum",
      sections: [
        { key: "anticipatory", label: "Getting ready to move", itemCount: 3 },
        { key: "reactive", label: "Reacting to a push", itemCount: 3 },
        { key: "sensory", label: "Standing on different surfaces", itemCount: 3 },
        { key: "dynamic_gait", label: "Balance while walking", itemCount: 5 },
      ],
    },
    medicationStateRequired: true,
  },
  {
    key: "freezing_episodes",
    label: "Freezing of gait diary",
    plainName: "Freezing episodes",
    unit: "episodes / week",
    min: 0,
    max: 500,
    decimals: 0,
    better: "lower",
    licence: "free",
    enabledByDefault: true,
    videoUse: "yes",
    profileKinds: ["neuro_parkinsons"],
    source: "outcome_measurements",
    // Patient diaries are a later phase; until then a therapist enters the
    // weekly count. Patients never write to outcome_measurements.
    capture: "diary",
  },
  {
    key: "pd_symptom_rating",
    label: "Physiotherapist's symptom rating",
    plainName: "Symptom profile (your physiotherapist's rating)",
    unit: "0-24",
    min: 0,
    max: 24,
    decimals: 0,
    better: "lower",
    licence: "free",
    enabledByDefault: true,
    videoUse: "no",
    profileKinds: ["neuro_parkinsons"],
    source: "outcome_measurements",
    capture: "score_sheet",
    scoreSheet: {
      itemCount: 6,
      itemMin: 0,
      itemMax: 4,
      itemStep: 1,
      maxBlanks: 0,
      totalRule: "sum",
      itemLabels: ["Tremor", "Stiffness", "Slowness", "Freezing", "Balance", "Posture"],
    },
    // NOT the MDS-UPDRS: the clinic's own summary, labelled "physiotherapist's
    // rating" everywhere. Tremor usually does not respond to exercise.
    clinicOwnRating: true,
    medicationStateRequired: true,
  },

  // ---- Geriatric (strength and balance) -----------------------------------------
  {
    key: "chair_stand_30s",
    label: "30-second chair stand",
    plainName: "Stands from a chair in 30 seconds",
    unit: "stands",
    min: 0,
    max: 40,
    decimals: 0,
    better: "higher",
    cutOffs: [{ type: "age_sex_norm", label: "Below average for age and sex (CDC STEADI)" }],
    norm: { kind: "age_sex_table", label: "CDC STEADI norms by age and sex" },
    licence: "free",
    enabledByDefault: true,
    videoUse: "with_helper",
    profileKinds: ["geriatric"],
    source: "outcome_measurements",
    capture: "single",
    usedArmsScoresZero: true,
    note: "If the arms must be used, the score is 0 (CDC STEADI): tick “used arms” and the stands done with the arms are kept beside it.",
  },
  {
    key: "four_stage_balance",
    label: "4-stage balance test",
    plainName: "Balance positions held",
    unit: "stage 0-4",
    min: 0,
    max: 4,
    decimals: 0,
    grades: FOUR_STAGE_GRADES,
    better: "higher",
    mcid: { value: 1, note: "one stage" },
    cutOffs: [
      // Not holding heel-to-toe for 10 seconds. To be verified by a senior
      // physiotherapist against its source.
      { type: "fixed", comparison: "below", value: STEADI_BALANCE_STAGE, level: "higher_risk", label: "Higher fall risk (heel-to-toe not held for 10 s)" },
    ],
    licence: "free",
    enabledByDefault: true,
    videoUse: "with_helper",
    profileKinds: ["geriatric"],
    source: "outcome_measurements",
    capture: "rating",
  },
  {
    key: "gait_speed_4m",
    label: "4-metre gait speed",
    plainName: "Walking speed",
    unit: "m/s",
    min: 0.05,
    max: 3,
    decimals: 2,
    better: "higher",
    // About 0.05 is a small real change, 0.1 a substantial one.
    // To be verified by a senior physiotherapist against its source.
    mdc: { value: 0.05, note: "small real change" },
    mcid: { value: 0.1, note: "substantial change" },
    cutOffs: [
      { type: "fixed", comparison: "below", value: STEADI_GAIT_SPEED_MPS, level: "higher_risk", label: "Linked with more falls and frailty (under 0.8 m/s)" },
    ],
    licence: "free",
    enabledByDefault: true,
    videoUse: "home_measured",
    profileKinds: ["geriatric"],
    source: "outcome_measurements",
    capture: "trials",
    trials: { count: 2, keep: "average" },
  },
  {
    key: "katz_adl",
    label: "Katz Index of Independence in ADL",
    plainName: "Everyday activities done without help",
    unit: "0-6",
    min: 0,
    max: 6,
    decimals: 0,
    better: "higher",
    mcid: { value: 1 },
    bands: [
      // The handbook gives "6 is fully independent, 2 or less severe
      // dependence"; the middle band's wording is this module's. To be
      // verified by a senior physiotherapist against its source.
      { min: 0, label: "Severe dependence (2 or less)" },
      { min: 3, label: "Needs help with some activities (3-5)" },
      { min: 6, label: "Fully independent (6)" },
    ],
    licence: "free",
    enabledByDefault: true,
    videoUse: "yes",
    profileKinds: ["geriatric"],
    source: "outcome_measurements",
    capture: "score_sheet",
    scoreSheet: {
      itemCount: 6,
      itemMin: 0,
      itemMax: 1,
      itemStep: 1,
      maxBlanks: 0,
      totalRule: "sum",
      itemLabels: ["Bathing", "Dressing", "Toileting", "Bed to chair", "Continence", "Feeding"],
    },
  },
  {
    key: "orthostatic_bp",
    label: "Orthostatic blood pressure",
    plainName: "Blood pressure drop on standing",
    // The value is the systolic (top-number) drop; the lying and standing
    // readings, and so the diastolic drop, are in `items` (`readings`
    // below). orthostaticDrop() is the authority on positive / negative.
    unit: "mmHg drop",
    min: -60,
    max: 120,
    decimals: 0,
    better: "lower",
    cutOffs: [
      // To be verified by a senior physiotherapist against its source.
      { type: "fixed", comparison: "at_or_above", value: ORTHOSTATIC_SYSTOLIC_DROP, level: "higher_risk", label: "Positive: tell the patient's doctor (top number fell 20 or more)" },
    ],
    licence: "free",
    enabledByDefault: true,
    videoUse: "no",
    profileKinds: ["geriatric"],
    source: "outcome_measurements",
    capture: "calculated",
    readings: {
      keys: [
        "lying_systolic",
        "lying_diastolic",
        "standing_1min_systolic",
        "standing_1min_diastolic",
        "standing_3min_systolic",
        "standing_3min_diastolic",
      ],
      derive: (r) => {
        const pair = (sys: string, dia: string) =>
          r[sys] !== undefined && r[dia] !== undefined ? { systolic: r[sys], diastolic: r[dia] } : null;
        const lying = pair("lying_systolic", "lying_diastolic");
        if (!lying) return null;
        const result = orthostaticDrop({
          lying,
          standing1Min: pair("standing_1min_systolic", "standing_1min_diastolic"),
          standing3Min: pair("standing_3min_systolic", "standing_3min_diastolic"),
        });
        return result.ok ? result.value.systolicDrop : null;
      },
    },
  },

  // ---- Cardiopulmonary ----------------------------------------------------------
  {
    key: "six_minute_walk",
    label: "Six-minute walk test",
    plainName: "Distance walked in six minutes",
    unit: "metres",
    min: 0,
    max: 1000,
    decimals: 0,
    better: "higher",
    // About 25-35 m (about 30 m in lung disease).
    // To be verified by a senior physiotherapist against its source.
    mcid: { value: 35, range: [25, 35], note: "about 30 m in lung disease" },
    norm: { kind: "predicted_equation", label: "Predicted distance (the equation the clinic chose)" },
    licence: "free",
    enabledByDefault: true,
    videoUse: "no",
    profileKinds: ["cardiopulmonary"],
    source: "outcome_measurements",
    capture: "trials",
    trials: { count: 2, keep: "best", note: "First visit only: two walks at least 30 minutes apart, keep the better." },
  },
  {
    key: "breathlessness_nrs",
    label: "Breathlessness rating (0-10)",
    plainName: "How breathless you feel",
    unit: "0-10",
    min: 0,
    max: 10,
    decimals: 0,
    better: "lower",
    mcid: { value: 1 },
    licence: "free",
    enabledByDefault: true,
    videoUse: "yes",
    profileKinds: ["cardiopulmonary"],
    source: "outcome_measurements",
    capture: "rating",
    variants: [
      { key: "rest", label: "At rest" },
      { key: "before_test", label: "Before the test" },
      { key: "after_test", label: "After the test" },
      { key: "during_exercise", label: "During exercise" },
    ],
  },
  {
    key: "resting_heart_rate",
    label: "Resting heart rate",
    plainName: "Resting heart rate",
    unit: "bpm",
    min: 30,
    max: 200,
    decimals: 0,
    better: "lower",
    licence: "free",
    enabledByDefault: true,
    videoUse: "home_device",
    profileKinds: ["cardiopulmonary"],
    source: "outcome_measurements",
    capture: "single",
  },
  {
    key: "lowest_spo2",
    label: "Lowest oxygen saturation (SpO2)",
    plainName: "Lowest oxygen level",
    unit: "%",
    min: 50,
    max: 100,
    decimals: 0,
    better: "higher",
    // The stop level is set per patient (often 88% for lung patients, 90% or
    // a 4-point drop for heart patients), never a fixed line.
    cutOffs: [{ type: "patient_limit", comparison: "below", label: "Below this patient's own limit" }],
    licence: "free",
    enabledByDefault: true,
    videoUse: "home_device",
    profileKinds: ["cardiopulmonary"],
    source: "outcome_measurements",
    capture: "single",
  },
  {
    key: "active_minutes",
    label: "Active minutes",
    plainName: "Active minutes a week",
    unit: "min / week",
    min: 0,
    max: 5000,
    decimals: 0,
    better: "higher",
    // WHO: 150-300 minutes a week for adults.
    // To be verified by a senior physiotherapist against its source.
    norm: { kind: "fixed", value: 150, label: "150 minutes a week (WHO)" },
    licence: "free",
    enabledByDefault: true,
    videoUse: "yes",
    profileKinds: ["cardiopulmonary"],
    source: "outcome_measurements",
    capture: "diary",
  },
  {
    key: "mmrc",
    label: "mMRC breathlessness grade",
    plainName: "Breathlessness in daily life",
    unit: "grade 0-4",
    min: 0,
    max: 4,
    decimals: 0,
    grades: MMRC_GRADES,
    better: "lower",
    mcid: { value: 1 },
    licence: "free",
    enabledByDefault: true,
    videoUse: "yes",
    profileKinds: ["cardiopulmonary"],
    source: "outcome_measurements",
    capture: "rating",
  },
  {
    key: "one_minute_sit_to_stand",
    label: "1-minute sit-to-stand",
    plainName: "Stands from a chair in one minute",
    unit: "stands",
    min: 0,
    max: 80,
    decimals: 0,
    better: "higher",
    // About 3 in COPD. To be verified by a senior physiotherapist against its source.
    mcid: { value: 3 },
    licence: "free",
    enabledByDefault: true,
    videoUse: "with_helper",
    profileKinds: ["cardiopulmonary"],
    source: "outcome_measurements",
    capture: "single",
  },

  // ---- Free, described in the handbook but outside its summary table -------------
  {
    key: "gmfcs",
    label: "Gross Motor Function Classification System",
    plainName: "Usual mobility level",
    unit: "level I-V",
    min: 1,
    max: 5,
    decimals: 0,
    grades: GMFCS_GRADES,
    // It classifies; it is not a progress score.
    better: "hold",
    licence: "free_with_attribution",
    enabledByDefault: true,
    videoUse: "with_parent",
    profileKinds: ["pediatrics"],
    // Recorded in the paediatric examination (pedsExam.ts), for a child
    // with cerebral palsy; one owner, so the measurement route refuses it.
    source: "peds_exam",
    capture: "rating",
    classification: true,
  },

  // ---- Licensed: off until the clinic confirms it holds the licence ---------------
  //
  // A reworded licensed scale is no longer the validated scale, so these are
  // never rebuilt "in our own words" to avoid the licence.
  {
    key: "oswestry",
    label: "Oswestry Disability Index",
    plainName: "Back pain and daily life",
    unit: "%",
    min: 0,
    max: 100,
    decimals: 1,
    better: "lower",
    mcid: { value: 10, note: "about 10 points" },
    licence: "licensed",
    enabledByDefault: false,
    videoUse: "yes",
    profileKinds: ["ortho"],
    source: "outcome_measurements",
    capture: "score_sheet",
    // One blank section is commonly allowed. To be verified against the manual.
    scoreSheet: { itemCount: 10, itemMin: 0, itemMax: 5, itemStep: 1, maxBlanks: 1, totalRule: "percent_of_answered_max" },
  },
  {
    key: "neck_disability_index",
    label: "Neck Disability Index",
    plainName: "Neck pain and daily life",
    unit: "0-50",
    min: 0,
    max: 50,
    decimals: 0,
    better: "lower",
    mcid: { value: 7, range: [5, 7] },
    licence: "licensed",
    enabledByDefault: false,
    videoUse: "yes",
    profileKinds: ["ortho"],
    source: "outcome_measurements",
    capture: "score_sheet",
    scoreSheet: { itemCount: 10, itemMin: 0, itemMax: 5, itemStep: 1, maxBlanks: 0, totalRule: "sum" },
  },
  {
    key: "quickdash",
    label: "QuickDASH",
    plainName: "Shoulder, arm and hand in daily life",
    unit: "0-100",
    min: 0,
    max: 100,
    decimals: 1,
    better: "lower",
    mcid: { value: 15, note: "about 15" },
    licence: "licensed",
    enabledByDefault: false,
    videoUse: "yes",
    profileKinds: ["ortho"],
    source: "outcome_measurements",
    capture: "score_sheet",
    // At least 10 of 11 answered. To be verified against the manual.
    scoreSheet: { itemCount: 11, itemMin: 1, itemMax: 5, itemStep: 1, maxBlanks: 1, totalRule: "quickdash" },
  },
  {
    key: "gmfm",
    label: "Gross Motor Function Measure (GMFM-66/88)",
    plainName: "Gross motor skills score",
    unit: "0-100",
    min: 0,
    max: 100,
    decimals: 1,
    better: "higher",
    licence: "licensed",
    enabledByDefault: false,
    videoUse: "no",
    profileKinds: ["pediatrics"],
    source: "outcome_measurements",
    capture: "score_sheet",
    note: "GMFM-66 is scored by its own software; the score is entered, not summed here.",
  },
  {
    key: "aims",
    label: "Alberta Infant Motor Scale",
    plainName: "Infant movement score",
    unit: "raw score 0-58",
    min: 0,
    max: 58,
    decimals: 0,
    better: "higher",
    norm: { kind: "age_sex_table", label: "Percentile for age (from the manual)" },
    licence: "licensed",
    enabledByDefault: false,
    videoUse: "with_parent",
    profileKinds: ["pediatrics"],
    source: "outcome_measurements",
    capture: "score_sheet",
  },
  {
    key: "peabody",
    label: "Peabody Developmental Motor Scales",
    plainName: "Movement skills standard score",
    unit: "standard score",
    // A quotient centred on 100. Range to be verified against the manual.
    min: 35,
    max: 165,
    decimals: 0,
    better: "higher",
    licence: "licensed",
    enabledByDefault: false,
    videoUse: "no",
    profileKinds: ["pediatrics"],
    source: "outcome_measurements",
    capture: "score_sheet",
    variants: [
      { key: "gross_motor", label: "Gross motor" },
      { key: "fine_motor", label: "Fine motor" },
    ],
  },
  {
    key: "cat",
    label: "COPD Assessment Test",
    plainName: "How COPD affects your life",
    unit: "0-40",
    min: 0,
    max: 40,
    decimals: 0,
    better: "lower",
    licence: "licensed",
    enabledByDefault: false,
    videoUse: "yes",
    profileKinds: ["cardiopulmonary"],
    source: "outcome_measurements",
    capture: "score_sheet",
    scoreSheet: { itemCount: 8, itemMin: 0, itemMax: 5, itemStep: 1, maxBlanks: 0, totalRule: "sum" },
  },
  {
    key: "borg_cr10",
    label: "Modified Borg breathlessness scale (CR10)",
    plainName: "Breathlessness (Borg)",
    unit: "0-10",
    min: 0,
    max: 10,
    decimals: 1,
    step: 0.5,
    better: "lower",
    licence: "licensed",
    enabledByDefault: false,
    videoUse: "yes",
    profileKinds: ["cardiopulmonary"],
    source: "outcome_measurements",
    capture: "rating",
    note: "The free 0-10 breathlessness rating works the same way in practice.",
  },
  {
    key: "borg_rpe",
    label: "Borg rating of perceived exertion (6-20)",
    plainName: "How hard the exercise feels (Borg)",
    unit: "6-20",
    min: 6,
    max: 20,
    decimals: 0,
    better: "hold",
    // Aim 11 to 14 ("fairly light" to "somewhat hard"): a target band, not
    // a direction. To be verified by a senior physiotherapist against its source.
    norm: { kind: "fixed", label: "Aim for 11 to 14" },
    licence: "licensed",
    enabledByDefault: false,
    videoUse: "yes",
    profileKinds: ["cardiopulmonary"],
    source: "outcome_measurements",
    capture: "rating",
    note: "The free alternative is the talk test.",
  },
  {
    key: "mds_updrs_3",
    label: "MDS-UPDRS Part III (motor examination)",
    plainName: "Movement examination",
    unit: "0-132",
    min: 0,
    max: 132,
    decimals: 0,
    better: "lower",
    licence: "licensed",
    enabledByDefault: false,
    videoUse: "no",
    profileKinds: ["neuro_parkinsons"],
    source: "outcome_measurements",
    capture: "score_sheet",
    scoreSheet: { itemCount: 33, itemMin: 0, itemMax: 4, itemStep: 1, maxBlanks: 0, totalRule: "sum" },
    medicationStateRequired: true,
  },
  {
    key: "nfog_q",
    label: "New Freezing of Gait Questionnaire",
    plainName: "Freezing questionnaire",
    unit: "0-28",
    min: 0,
    max: 28,
    decimals: 0,
    better: "lower",
    // The handbook says "check its licence first": treated as licensed until
    // the clinic confirms otherwise.
    licence: "licensed",
    enabledByDefault: false,
    videoUse: "yes",
    profileKinds: ["neuro_parkinsons"],
    source: "outcome_measurements",
    capture: "score_sheet",
  },
];

const BY_KEY = new Map(OUTCOME_MEASURES.map((m) => [m.key, m]));

// A duplicate key would merge two different tests onto one graph line.
// Thrown at module load, the same posture conditionIntake.ts takes over
// intake keys.
if (BY_KEY.size !== OUTCOME_MEASURES.length) {
  throw new Error("outcomeMeasures: duplicate measure key in OUTCOME_MEASURES");
}
// A licensed measure that switched itself on would be the clinic using a
// scale it has not paid for.
for (const m of OUTCOME_MEASURES) {
  if (m.licence === "licensed" && m.enabledByDefault) {
    throw new Error(`outcomeMeasures: licensed measure "${m.key}" must be off by default`);
  }
}

export function outcomeMeasure(key: string): OutcomeMeasure | null {
  return BY_KEY.get(key) ?? null;
}

export function measuresForProfileKind(kind: ProfileKind): OutcomeMeasure[] {
  return OUTCOME_MEASURES.filter((m) => m.profileKinds.includes(kind));
}

/** On by default, or a licensed measure the clinic has switched on (an
 *  admin setting in a later phase; the caller passes what it read). */
export function isMeasureEnabled(key: string, enabledLicensed: ReadonlySet<string> = new Set()): boolean {
  const m = outcomeMeasure(key);
  if (!m) return false;
  return m.enabledByDefault || enabledLicensed.has(m.key);
}

/** Which table holds this measure for this kind of patient. A measure the
 *  neurological exam owns for a kind is read from the exam and must never be
 *  written to outcome_measurements as well -- two sources for one line is
 *  how a graph shows a change that is only a change of table. */
export function measurementSource(key: string, kind: ProfileKind): MeasureSource | null {
  const m = outcomeMeasure(key);
  if (!m) return null;
  if (m.neuroExam && m.neuroExam.ownsFor.includes(kind)) return "neuro_exam";
  if (m.source === "neuro_exam") return "neuro_exam";
  return m.source;
}

/** ON/OFF and last-dose time are required on a Parkinson's measurement. */
export function needsMedicationState(key: string, kind: ProfileKind): boolean {
  const m = outcomeMeasure(key);
  return !!m && kind === "neuro_parkinsons" && m.medicationStateRequired === true;
}

// --- Change -----------------------------------------------------------------------

export function mdcFor(m: OutcomeMeasure, kind?: ProfileKind): RealChange | undefined {
  return (kind && m.mdcByKind?.[kind]) || m.mdc;
}

export function mcidFor(m: OutcomeMeasure, kind?: ProfileKind): RealChange | undefined {
  return (kind && m.mcidByKind?.[kind]) || m.mcid;
}

const EPSILON = 1e-9;

export type ChangeDirection = "better" | "worse" | "no_change" | "changed";

/**
 * Which way a measure moved between two readings, honest about noise: a move
 * smaller than the measure's MDC is "no_change", so the status pill never
 * says "Improving" on a change below measurement error. Where no MDC is
 * known the MCID stands in (the larger figure, so the error is on the side
 * of "no change"). "changed" is the answer when the measure has no better
 * direction (a stage, a classification, an age reached) or no threshold at
 * all is known: the numbers moved, and nothing here can say whether that
 * was real or good.
 *
 * `normal` is the value a "toward_normal" measure is judged against (the
 * other side, or usualJointRange()); `differentTester` widens the allowance
 * where the handbook gives a between-tester figure.
 */
export function changeDirection(
  key: string,
  from: number,
  to: number,
  opts: { profileKind?: ProfileKind; normal?: number; differentTester?: boolean } = {}
): ChangeDirection | null {
  const m = outcomeMeasure(key);
  if (!m || !Number.isFinite(from) || !Number.isFinite(to)) return null;
  if (m.better === "hold" || m.better === "earlier") return "changed";
  const threshold = mdcFor(m, opts.profileKind) ?? mcidFor(m, opts.profileKind);
  // No handbook figure for the real-change allowance: any move counts, and
  // the better direction still decides the word (a measure with no published
  // MDC must not read "Changed" while its neighbours read "Better").
  const allowance = !threshold ? 0 : opts.differentTester && threshold.betweenTesters ? threshold.betweenTesters : threshold.value;

  let gain: number;
  if (m.better === "higher") gain = to - from;
  else if (m.better === "lower") gain = from - to;
  else {
    if (opts.normal === undefined || !Number.isFinite(opts.normal)) return to === from ? "no_change" : "changed";
    gain = Math.abs(from - opts.normal) - Math.abs(to - opts.normal);
  }
  if (Math.abs(to - from) + EPSILON < allowance || (!threshold && to === from)) return "no_change";
  if (Math.abs(gain) < EPSILON) return "changed";
  return gain > 0 ? "better" : "worse";
}

/** Whether a change is at least the measure's MCID -- the change worth
 *  telling the patient about. Magnitude only (pair it with
 *  changeDirection() for which way); null when no MCID is known. */
export function isMeaningfulChange(key: string, from: number, to: number, profileKind?: ProfileKind): boolean | null {
  const m = outcomeMeasure(key);
  if (!m || !Number.isFinite(from) || !Number.isFinite(to)) return null;
  const mcid = mcidFor(m, profileKind);
  if (!mcid) return null;
  return Math.abs(to - from) + EPSILON >= mcid.value;
}

// --- Cut-offs and bands -------------------------------------------------------------

export type RiskReading =
  | { band: "higher_risk" | "very_high_risk" | "not_flagged"; label: string | null; line: number | null }
  /** The cut-off needs something the caller did not supply: never read as
   *  "not flagged". */
  | { band: "unknown"; reason: "needs_age_and_sex" | "needs_patient_limit" | "outside_norm_table" };

function crosses(value: number, comparison: CutOffComparison, line: number): boolean {
  switch (comparison) {
    case "at_or_above":
      return value >= line;
    case "above":
      return value > line;
    case "at_or_below":
      return value <= line;
    case "below":
      return value < line;
  }
}

/**
 * Where a reading sits against the measure's risk cut-offs for this kind of
 * patient. null when the measure has no cut-off for that kind. The most
 * severe line crossed wins. "unknown" when the line depends on something
 * not supplied (age and sex, the patient's own limit) -- a check that could
 * not be run is not a check that came back negative.
 */
export function riskBand(
  key: string,
  value: number,
  ctx: { profileKind: ProfileKind; ageYears?: number; sex?: Sex; patientLimit?: number }
): RiskReading | null {
  const m = outcomeMeasure(key);
  if (!m || !Number.isFinite(value)) return null;
  const lines = (m.cutOffs ?? []).filter((c) => !c.profileKinds || c.profileKinds.includes(ctx.profileKind));
  if (lines.length === 0) return null;

  let worst: { band: "higher_risk" | "very_high_risk"; label: string; line: number } | null = null;
  for (const c of lines) {
    if (c.type === "patient_limit") {
      if (ctx.patientLimit === undefined || !Number.isFinite(ctx.patientLimit)) {
        return { band: "unknown", reason: "needs_patient_limit" };
      }
      if (crosses(value, c.comparison, ctx.patientLimit)) {
        worst = { band: "higher_risk", label: c.label, line: ctx.patientLimit };
      }
      continue;
    }
    if (c.type === "age_sex_norm") {
      if (ctx.ageYears === undefined || !ctx.sex) return { band: "unknown", reason: "needs_age_and_sex" };
      const norm = chairStandNorm(ctx.ageYears, ctx.sex);
      if (!norm) return { band: "unknown", reason: "outside_norm_table" };
      if (value < norm.belowAverageUnder) {
        worst = { band: "higher_risk", label: c.label, line: norm.belowAverageUnder };
      }
      continue;
    }
    if (crosses(value, c.comparison, c.value)) {
      if (!worst || (c.level === "very_high_risk" && worst.band !== "very_high_risk")) {
        worst = { band: c.level, label: c.label, line: c.value };
      }
    }
  }
  return worst ?? { band: "not_flagged", label: null, line: null };
}

/** The descriptive band a value falls in (pain mild / moderate / severe,
 *  Barthel's dependence bands, the walking-speed zones), or null. */
export function bandFor(key: string, value: number): string | null {
  const m = outcomeMeasure(key);
  if (!m?.bands || !Number.isFinite(value)) return null;
  let label: string | null = null;
  for (const band of m.bands) if (value + EPSILON >= band.min) label = band.label;
  return label;
}

// --- Validation -----------------------------------------------------------------------

export type ValueResult = { ok: true; value: number } | { ok: false; error: string };

/**
 * A value the measure can hold: a finite number inside its range, on its
 * grade list or step, and stored to its precision (a value with more
 * decimals than the measure keeps is rounded, never refused -- a stopwatch
 * gives hundredths and TUG keeps tenths).
 */
export function validateMeasurementValue(key: string, raw: unknown): ValueResult {
  const m = outcomeMeasure(key);
  if (!m) return { ok: false, error: "Unknown measure." };
  if (typeof raw !== "number" || !Number.isFinite(raw)) return { ok: false, error: `${m.label}: enter a number.` };
  const value = roundTo(raw, m.decimals);
  if (value < m.min || value > m.max) {
    return { ok: false, error: `${m.label} must be between ${m.min} and ${m.max} (${m.unit}).` };
  }
  if (m.grades && !m.grades.some((g) => Math.abs(g.value - value) < EPSILON)) {
    return { ok: false, error: `${m.label}: ${value} is not one of the scale's own values.` };
  }
  if (m.step) {
    const steps = (value - m.min) / m.step;
    if (Math.abs(steps - Math.round(steps)) > 1e-6) {
      return { ok: false, error: `${m.label} moves in steps of ${m.step}.` };
    }
  }
  return { ok: true, value };
}

export type MeasurementSetting = "in_person" | "video";

/** What was true when the number was taken. A number without these cannot
 *  be compared later. Stored as outcome_measurements.conditions (jsonb). */
export type MeasurementConditions = {
  setting: MeasurementSetting;
  walkingAid?: string;
  /** Footwear, orthoses or splints. */
  footwear?: string;
  medicationState?: "on" | "off";
  /** ISO timestamp of the last dose. */
  lastDoseAt?: string;
  /** The person who measured, when it is not the person recording. */
  testerName?: string;
  /** Seen in the session, or reported by the patient / family. */
  method?: "observed" | "reported";
  /** Another adult stood beside the patient (balance over video). */
  helperPresent?: boolean;
  /** Distance marked out at home, or a home device used. */
  homeMeasured?: boolean;
  supplementalOxygenLpm?: number;
  /** Pain 0-10 before the test. */
  painBefore?: number;
  /** The patient had to use their arms to stand (the 30-second chair
   *  stand): the score is then 0, and the stands with the arms are in
   *  `items`. Only on a measure with `usedArmsScoresZero`. */
  usedArms?: boolean;
};

/** The one key `items` holds when the arms were used: what was counted
 *  before the CDC rule zeroed the score. */
export const STANDS_WITH_ARMS_KEY = "standsWithArms";

const CONDITION_KEYS: readonly (keyof MeasurementConditions)[] = [
  "setting",
  "walkingAid",
  "footwear",
  "medicationState",
  "lastDoseAt",
  "testerName",
  "method",
  "helperPresent",
  "homeMeasured",
  "supplementalOxygenLpm",
  "painBefore",
  "usedArms",
];

export const CONDITION_TEXT_MAX = 80;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(raw: unknown, label: string): { value?: string; error?: string } {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "string") return { error: `${label} must be text.` };
  const trimmed = raw.trim();
  if (!trimmed) return {};
  if (trimmed.length > CONDITION_TEXT_MAX) return { error: `${label} must be ${CONDITION_TEXT_MAX} characters or fewer.` };
  return { value: trimmed };
}

/** The conditions a measurement was taken under, refused when a rule the
 *  handbook makes compulsory is missing. */
export function validateMeasurementConditions(
  raw: unknown,
  ctx: { measureKey: string; profileKind: ProfileKind; measuredAtMs: number }
): { ok: true; conditions: MeasurementConditions } | { ok: false; error: string } {
  const m = outcomeMeasure(ctx.measureKey);
  if (!m) return { ok: false, error: "Unknown measure." };
  if (!isPlainObject(raw)) return { ok: false, error: "Say how the test was done (in person or video)." };
  const unknown = Object.keys(raw).filter((k) => !(CONDITION_KEYS as readonly string[]).includes(k));
  if (unknown.length) return { ok: false, error: `Unknown condition: ${unknown.join(", ")}.` };

  if (raw.setting !== "in_person" && raw.setting !== "video") {
    return { ok: false, error: "Say whether the test was in person or over video." };
  }
  const out: MeasurementConditions = { setting: raw.setting };

  for (const [key, label] of [
    ["walkingAid", "Walking aid"],
    ["footwear", "Footwear"],
    ["testerName", "Who measured"],
  ] as const) {
    const read = readText(raw[key], label);
    if (read.error) return { ok: false, error: read.error };
    if (read.value) out[key] = read.value;
  }

  for (const key of ["helperPresent", "homeMeasured"] as const) {
    if (raw[key] === undefined || raw[key] === null) continue;
    if (typeof raw[key] !== "boolean") return { ok: false, error: `${key} must be yes or no.` };
    out[key] = raw[key] as boolean;
  }

  if (raw.usedArms !== undefined && raw.usedArms !== null) {
    if (typeof raw.usedArms !== "boolean") return { ok: false, error: "Used arms must be yes or no." };
    if (!m.usedArmsScoresZero) return { ok: false, error: `${m.label} does not record whether the arms were used.` };
    out.usedArms = raw.usedArms;
  }

  if (raw.method !== undefined && raw.method !== null) {
    if (raw.method !== "observed" && raw.method !== "reported") return { ok: false, error: "Say whether it was observed or reported." };
    out.method = raw.method;
  }

  if (raw.supplementalOxygenLpm !== undefined && raw.supplementalOxygenLpm !== null) {
    const o2 = raw.supplementalOxygenLpm;
    if (typeof o2 !== "number" || !Number.isFinite(o2) || o2 < 0 || o2 > 15) {
      return { ok: false, error: "Oxygen must be between 0 and 15 litres a minute." };
    }
    out.supplementalOxygenLpm = o2;
  }

  if (raw.painBefore !== undefined && raw.painBefore !== null) {
    const p = raw.painBefore;
    if (typeof p !== "number" || !Number.isInteger(p) || p < 0 || p > 10) {
      return { ok: false, error: "Pain before the test must be a whole number from 0 to 10." };
    }
    out.painBefore = p;
  }

  if (raw.medicationState !== undefined && raw.medicationState !== null) {
    if (raw.medicationState !== "on" && raw.medicationState !== "off") return { ok: false, error: "Medication state must be ON or OFF." };
    out.medicationState = raw.medicationState;
  }
  if (raw.lastDoseAt !== undefined && raw.lastDoseAt !== null) {
    const dose = typeof raw.lastDoseAt === "string" ? Date.parse(raw.lastDoseAt) : NaN;
    if (!Number.isFinite(dose)) return { ok: false, error: "The last dose time is not a time." };
    if (dose > ctx.measuredAtMs) return { ok: false, error: "The last dose time is after the test." };
    out.lastDoseAt = new Date(dose).toISOString();
  }
  if (needsMedicationState(m.key, ctx.profileKind) && (!out.medicationState || !out.lastDoseAt)) {
    return { ok: false, error: "On a Parkinson's measurement, record ON or OFF and the time of the last dose." };
  }

  if (out.setting === "video") {
    if (m.videoUse === "no") return { ok: false, error: `${m.label} is done in person only.` };
    if (m.videoUse === "with_helper" && out.helperPresent !== true) {
      return { ok: false, error: `${m.label} over video needs another adult standing beside the patient.` };
    }
    if ((m.videoUse === "home_measured" || m.videoUse === "home_device") && out.homeMeasured !== true) {
      return { ok: false, error: `${m.label} over video is marked as measured at home.` };
    }
  }
  return { ok: true, conditions: out };
}

export type MeasurementSide = "left" | "right";

export type CleanMeasurement = {
  measureKey: string;
  value: number;
  /** Score-sheet answers or a timed test's trials (an array), or named
   *  readings (an object). */
  items: (number | null)[] | Record<string, number> | null;
  side: MeasurementSide | null;
  variant: string | null;
  conditions: MeasurementConditions;
  measuredAt: string;
  schemaVersion: number;
};

/**
 * Whether the individual trials must travel with the value: on the
 * Parkinson's sub-profile, a timed test that the handbook averages over
 * trials (Timed Up and Go, the 10-metre walk) is stored with every trial,
 * because single trials vary so much there that a reader has to be able to
 * see the spread -- the owner's decision ("ON/OFF and 3 trials"). Everywhere
 * else the trials are optional.
 */
export function trialsRequired(key: string, kind: ProfileKind): boolean {
  const m = outcomeMeasure(key);
  return !!m && kind === "neuro_parkinsons" && m.capture === "trials" && !!m.trials && m.medicationStateRequired === true;
}

/** How many trials a measure may carry: its count, plus the tie-breaking
 *  third reading a "median" rule asks for (goniometry: two readings more
 *  than 5 degrees apart get a third). */
export function maxTrialsFor(m: OutcomeMeasure): number {
  if (!m.trials) return 0;
  return m.trials.keep === "median" ? m.trials.count + 1 : m.trials.count;
}

/**
 * A timed test's individual trials, stored in `items` as a plain list of
 * numbers in the measure's own unit, and the stored value checked against
 * the measure's keep rule (average, best or median) -- so the number on the
 * graph can always be re-worked from what was timed. A trial is a value the
 * measure itself could hold. Not exported: validateMeasurement is the door.
 */
function validateTrials(
  m: OutcomeMeasure,
  raw: readonly unknown[],
  storedValue: number
): { ok: true; trials: number[] } | { ok: false; error: string } {
  const rule = m.trials!;
  const max = maxTrialsFor(m);
  if (raw.length < 1 || raw.length > max) {
    return { ok: false, error: `${m.label}: enter between 1 and ${max} trials.` };
  }
  const trials: number[] = [];
  for (const t of raw) {
    const checked = validateMeasurementValue(m.key, t);
    if (!checked.ok) return { ok: false, error: `${m.label}, a trial: ${checked.error}` };
    trials.push(checked.value);
  }
  let kept: number | null;
  if (rule.keep === "average") kept = averageOfTrials(trials);
  else if (rule.keep === "median") kept = medianOfTrials(trials);
  else if (m.better === "higher" || m.better === "lower") kept = bestOfTrials(trials, m.better);
  else kept = null;
  if (kept === null) return { ok: false, error: `${m.label}: these trials do not give a result.` };
  const keptRounded = roundTo(kept, m.decimals);
  if (Math.abs(keptRounded - storedValue) > EPSILON) {
    return { ok: false, error: `${m.label}: the value (${storedValue}) does not match the trials (${keptRounded}).` };
  }
  return { ok: true, trials };
}

/**
 * The CDC STEADI chair-stand rule: if the patient must use their arms to
 * stand, the score is 0. So with `usedArms` true the stored value must be 0
 * -- a count with the arms on the graph would read as a strength the
 * patient does not have -- and the stands done with the arms travel in
 * `items` as `{ standsWithArms: n }` (a whole number the measure could
 * hold), so the reader can still see what happened. Without it, `items`
 * stays empty: a chair stand has no item scores. A measure without
 * `usedArmsScoresZero` never gets here (validateMeasurementConditions
 * refuses `usedArms` on it).
 */
export function validateUsedArms(
  m: OutcomeMeasure,
  usedArms: boolean,
  value: number,
  rawItems: unknown
): { ok: true; items: Record<string, number> | null } | { ok: false; error: string } {
  if (!usedArms) {
    if (rawItems !== undefined && rawItems !== null) {
      return { ok: false, error: `${m.label}: the stands with arms are recorded only when the arms were used.` };
    }
    return { ok: true, items: null };
  }
  if (Math.abs(value) > EPSILON) {
    return { ok: false, error: `${m.label}: when the arms were used the score is 0; the stands with arms are kept beside it.` };
  }
  if (!isPlainObject(rawItems)) {
    return { ok: false, error: `${m.label}: record how many stands were done with the arms.` };
  }
  const extra = Object.keys(rawItems).filter((k) => k !== STANDS_WITH_ARMS_KEY);
  if (extra.length) return { ok: false, error: `${m.label}: unknown reading ${extra.join(", ")}.` };
  const n = rawItems[STANDS_WITH_ARMS_KEY];
  if (typeof n !== "number" || !Number.isInteger(n) || n < m.min || n > m.max) {
    return { ok: false, error: `${m.label}: the stands with arms must be a whole number from ${m.min} to ${m.max}.` };
  }
  return { ok: true, items: { [STANDS_WITH_ARMS_KEY]: n } };
}

/** What a chair stand with the arms used is stored as: 0, and the count. */
export function usedArmsEntry(standsWithArms: number): { value: 0; items: Record<string, number> } {
  return { value: 0, items: { [STANDS_WITH_ARMS_KEY]: standsWithArms } };
}

/**
 * A measurement as a screen sends it (the `measurement` of
 * /api/therapist/measurements/submit and /api/admin/measurements/submit),
 * before validateMeasurement() checks it. `items` is a score sheet's answers
 * or a timed test's trials (a list) or a calculated measure's named readings
 * (an object). `measuredAt` is an ISO timestamp.
 */
export type MeasurementInput = {
  measureKey: string;
  value: number;
  measuredAt: string;
  conditions: MeasurementConditions;
  side?: MeasurementSide | null;
  variant?: string | null;
  items?: (number | null)[] | Record<string, number> | null;
};

/** How far ahead of the server's clock a measured_at may be (a phone whose
 *  clock runs a little fast), and how far back a test may be entered. */
export const MEASURED_AT_FUTURE_SLACK_MS = 5 * 60_000;
export const MEASURED_AT_MAX_AGE_DAYS = 366;

/**
 * The whole of a measurement as a route will receive it, checked against
 * the registry: the measure exists, is switched on (licence), belongs to
 * this kind of patient, is stored in outcome_measurements for it (not owned
 * by the Pain Map or the neurological exam), and its value, side, variant,
 * score-sheet items and conditions are all ones the measure can hold. A
 * score sheet's stored total must equal what its items add up to.
 *
 * `nowMs` is required, never a Date.now() default, so the debug bar's
 * simulated clock reaches it (see ops-security.md).
 */
export function validateMeasurement(
  raw: unknown,
  ctx: { profileKind: ProfileKind; nowMs: number; enabledLicensed?: ReadonlySet<string> }
): { ok: true; measurement: CleanMeasurement } | { ok: false; error: string } {
  if (!isPlainObject(raw)) return { ok: false, error: "Nothing to record." };
  const key = typeof raw.measureKey === "string" ? raw.measureKey : "";
  const m = outcomeMeasure(key);
  if (!m) return { ok: false, error: "Unknown measure." };
  if (!isMeasureEnabled(key, ctx.enabledLicensed)) {
    return { ok: false, error: `${m.label} is switched off until the clinic confirms its licence.` };
  }
  if (!m.profileKinds.includes(ctx.profileKind)) {
    return { ok: false, error: `${m.label} is not used on a ${PROFILE_KIND_LABELS[ctx.profileKind].label} profile.` };
  }
  const source = measurementSource(key, ctx.profileKind);
  if (source === "neuro_exam") return { ok: false, error: `${m.label} is recorded in the neurological examination.` };
  if (source === "pain_map") return { ok: false, error: `${m.label} is recorded on the Pain Map.` };
  if (source === "peds_exam") return { ok: false, error: `${m.label} is recorded in the paediatric examination.` };

  const measuredAtMs = typeof raw.measuredAt === "string" ? Date.parse(raw.measuredAt) : NaN;
  if (!Number.isFinite(measuredAtMs)) return { ok: false, error: "Say when the test was done." };
  if (measuredAtMs > ctx.nowMs + MEASURED_AT_FUTURE_SLACK_MS) return { ok: false, error: "The test time is in the future." };
  if (measuredAtMs < ctx.nowMs - MEASURED_AT_MAX_AGE_DAYS * 86_400_000) {
    return { ok: false, error: "The test time is more than a year ago." };
  }

  const valueResult = validateMeasurementValue(key, raw.value);
  if (!valueResult.ok) return valueResult;

  let side: MeasurementSide | null = null;
  if (m.sided) {
    if (raw.side !== "left" && raw.side !== "right") return { ok: false, error: `${m.label}: say which side.` };
    side = raw.side;
  } else if (raw.side !== undefined && raw.side !== null) {
    return { ok: false, error: `${m.label} is not recorded per side.` };
  }

  let variant: string | null = null;
  if (m.variants) {
    const v = raw.variant;
    if (typeof v !== "string" || !m.variants.some((x) => x.key === v)) {
      return { ok: false, error: `${m.label}: say which one was measured.` };
    }
    variant = v;
  } else if (raw.variant !== undefined && raw.variant !== null) {
    return { ok: false, error: `${m.label} has no variants.` };
  }

  let items: CleanMeasurement["items"] = null;
  const trialItems = Array.isArray(raw.items) && m.capture === "trials" && !!m.trials && !m.scoreSheet;
  if (trialItems) {
    const trials = validateTrials(m, raw.items as unknown[], valueResult.value);
    if (!trials.ok) return trials;
    if (trialsRequired(key, ctx.profileKind) && trials.trials.length !== m.trials!.count) {
      return { ok: false, error: `${m.label}: on a Parkinson's measurement, record all ${m.trials!.count} trials.` };
    }
    items = trials.trials;
  } else if (trialsRequired(key, ctx.profileKind)) {
    return { ok: false, error: `${m.label}: on a Parkinson's measurement, record all ${m.trials!.count} trials.` };
  } else if (m.readings) {
    if (!isPlainObject(raw.items)) return { ok: false, error: `${m.label}: enter the readings it is worked out from.` };
    const readings: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw.items)) {
      if (!m.readings.keys.includes(k)) return { ok: false, error: `${m.label}: unknown reading ${k}.` };
      if (typeof v !== "number" || !Number.isFinite(v)) return { ok: false, error: `${m.label}: ${k} must be a number.` };
      readings[k] = v;
    }
    const derived = m.readings.derive(readings);
    if (derived === null) return { ok: false, error: `${m.label}: these readings do not give a result.` };
    if (Math.abs(roundTo(derived, m.decimals) - valueResult.value) > EPSILON) {
      return { ok: false, error: `${m.label}: the value (${valueResult.value}) does not match the readings (${derived}).` };
    }
    items = readings;
  } else if (m.usedArmsScoresZero) {
    // Checked with the conditions below (validateUsedArms): `items` here is
    // the stands done with the arms, and only when the arms were used.
  } else if (raw.items !== undefined && raw.items !== null) {
    if (!m.scoreSheet) return { ok: false, error: `${m.label} has no item scores.` };
    if (!Array.isArray(raw.items)) return { ok: false, error: "Item scores must be a list." };
    const sheet = scoreSheetTotal(m.scoreSheet, raw.items as (number | null)[]);
    if (!sheet.ok) return { ok: false, error: `${m.label}: ${sheet.error}` };
    if (Math.abs(sheet.total - valueResult.value) > EPSILON) {
      return { ok: false, error: `${m.label}: the total (${valueResult.value}) does not match the items (${sheet.total}).` };
    }
    items = raw.items as (number | null)[];
  }

  const cond = validateMeasurementConditions(raw.conditions, { measureKey: key, profileKind: ctx.profileKind, measuredAtMs });
  if (!cond.ok) return cond;

  if (m.usedArmsScoresZero) {
    const arms = validateUsedArms(m, cond.conditions.usedArms === true, valueResult.value, raw.items);
    if (!arms.ok) return arms;
    items = arms.items;
  }

  return {
    ok: true,
    measurement: {
      measureKey: key,
      value: valueResult.value,
      items,
      side,
      variant,
      conditions: cond.conditions,
      measuredAt: new Date(measuredAtMs).toISOString(),
      schemaVersion: OUTCOME_MEASURES_VERSION,
    },
  };
}
