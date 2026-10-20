// The neurological examination chart: what a clinician records, which values
// each finding may take, and everything read back out of it -- validation,
// asymmetry, fall-risk bands and the change since the previous exam.
//
// Dependency-free on purpose (the "business maths lives in src/lib" rule):
// the route validates a submission with exactly the same tables the dialog
// renders its controls from, so a value the screen cannot offer is a value
// the server refuses, and the tests can reason about all of it without a
// browser.
//
// The ORTHOPAEDIC chart is the Pain Map (painMap.ts, pain_assessments). This
// is its neurological counterpart and deliberately shares nothing with it --
// no body regions, no pain percentage -- per the clinical rule that the two
// layers are separate tables read by separate code. Stored in
// neuro_assessments.findings (jsonb), one append-only row per examination,
// so a re-examination is a new row and the chart can say what changed.
//
// Three representation rules hold the whole thing together:
//
//   1. **"Not tested" is the absence of a key, never a value.** A row a
//      clinician did not examine is simply not in `bilateral`, and a side
//      they did not examine is simply not on the row. That is what lets the
//      summary say "Normal" and "Not tested" as two different facts -- the
//      exact distinction a blank form cannot make.
//   2. **Every scored value is one of its scale's own strings** ("1+", "3",
//      "2+", "intact"), never a free number. A scale's options are the only
//      valid answers; the route refuses anything else.
//   3. **Severity is derived, not stored.** Each scale knows how far a value
//      sits from normal (0 = normal). Asymmetry, "abnormal" counts and the
//      better/worse arrows are all read from that one number, so the three
//      can never disagree about which side is the affected one.

export const NEURO_EXAM_VERSION = 1;

export type ExamSide = "left" | "right";
export const EXAM_SIDES: readonly ExamSide[] = ["left", "right"];

// --- Scales ---------------------------------------------------------------

export type NeuroScaleKey =
  | "mas"
  | "mrc"
  | "reflex"
  | "plantar"
  | "sensation"
  | "coordination"
  | "balance_grade"
  | "romberg"
  | "berg_item";

export type ScaleOption = {
  value: string;
  /** What the segmented control prints. Usually the value itself. */
  short: string;
  /** The scale's own definition, in clinician register. */
  meaning: string;
  /** The same thing in a patient's words, where those differ. */
  patientMeaning?: string;
  /** Distance from normal: 0 is normal, higher is further away. */
  severity: number;
};

export type NeuroScale = {
  key: NeuroScaleKey;
  /** The scale's name as a clinician would cite it. */
  name: string;
  options: readonly ScaleOption[];
  /** The value a normal finding takes -- what "Mark the rest normal" sets. */
  normal: string;
};

export const NEURO_SCALES: Record<NeuroScaleKey, NeuroScale> = {
  mas: {
    key: "mas",
    name: "Modified Ashworth Scale",
    normal: "0",
    options: [
      { value: "0", short: "0", severity: 0, meaning: "No increase in tone", patientMeaning: "Normal - no extra stiffness" },
      {
        value: "1",
        short: "1",
        severity: 1,
        meaning: "Slight increase - a catch and release, or minimal resistance at the end of range",
        patientMeaning: "Very slightly stiff, at the end of the movement",
      },
      {
        value: "1+",
        short: "1+",
        severity: 2,
        meaning: "Slight increase - a catch, then minimal resistance through less than half the range",
        patientMeaning: "Slightly stiff through part of the movement",
      },
      {
        value: "2",
        short: "2",
        severity: 3,
        meaning: "More marked increase through most of the range, but the part moves easily",
        patientMeaning: "Stiff through most of the movement, but it still moves easily",
      },
      {
        value: "3",
        short: "3",
        severity: 4,
        meaning: "Considerable increase - passive movement is difficult",
        patientMeaning: "Very stiff - hard to move it for you",
      },
      { value: "4", short: "4", severity: 5, meaning: "Rigid in flexion or extension", patientMeaning: "Fixed - it does not move" },
    ],
  },
  mrc: {
    key: "mrc",
    name: "Oxford / MRC scale",
    normal: "5",
    options: [
      { value: "0", short: "0", severity: 5, meaning: "No contraction", patientMeaning: "No movement at all" },
      { value: "1", short: "1", severity: 4, meaning: "Flicker or trace of contraction", patientMeaning: "A flicker of the muscle, no movement" },
      { value: "2", short: "2", severity: 3, meaning: "Active movement with gravity eliminated", patientMeaning: "Moves when supported" },
      { value: "3", short: "3", severity: 2, meaning: "Active movement against gravity", patientMeaning: "Moves against gravity on its own" },
      { value: "4", short: "4", severity: 1, meaning: "Active movement against gravity and some resistance", patientMeaning: "Strong, but not full strength" },
      { value: "5", short: "5", severity: 0, meaning: "Normal power", patientMeaning: "Full strength" },
    ],
  },
  reflex: {
    key: "reflex",
    name: "Reflex grading (0 to 4+)",
    normal: "2+",
    options: [
      { value: "0", short: "0", severity: 2, meaning: "Absent", patientMeaning: "No reflex found" },
      { value: "1+", short: "1+", severity: 1, meaning: "Diminished - a trace response", patientMeaning: "Weaker than usual" },
      { value: "2+", short: "2+", severity: 0, meaning: "Normal", patientMeaning: "Normal" },
      { value: "3+", short: "3+", severity: 1, meaning: "Brisk - increased, may spread", patientMeaning: "Stronger than usual" },
      { value: "4+", short: "4+", severity: 2, meaning: "Very brisk, with clonus", patientMeaning: "Much stronger than usual, with repeated jerks" },
    ],
  },
  plantar: {
    key: "plantar",
    name: "Plantar response",
    normal: "flexor",
    options: [
      { value: "flexor", short: "Down", severity: 0, meaning: "Flexor - toes curl down (normal)", patientMeaning: "Normal" },
      { value: "equivocal", short: "Equiv.", severity: 1, meaning: "Equivocal - no clear direction", patientMeaning: "Unclear" },
      { value: "mute", short: "None", severity: 1, meaning: "No response", patientMeaning: "No response" },
      { value: "extensor", short: "Up", severity: 2, meaning: "Extensor - big toe goes up (Babinski sign)", patientMeaning: "Toe goes up - a sign your therapist watches" },
    ],
  },
  sensation: {
    key: "sensation",
    name: "Sensation",
    normal: "intact",
    options: [
      { value: "intact", short: "Intact", severity: 0, meaning: "Intact - felt normally", patientMeaning: "Felt normally" },
      { value: "impaired", short: "Impaired", severity: 1, meaning: "Impaired - reduced or altered", patientMeaning: "Felt less, or differently" },
      { value: "absent", short: "Absent", severity: 2, meaning: "Absent - not felt", patientMeaning: "Not felt" },
    ],
  },
  coordination: {
    key: "coordination",
    name: "Coordination",
    normal: "normal",
    options: [
      { value: "normal", short: "Normal", severity: 0, meaning: "Normal - smooth and accurate", patientMeaning: "Smooth and accurate" },
      {
        value: "impaired",
        short: "Impaired",
        severity: 1,
        meaning: "Impaired - slow, overshooting, tremor or breaking up",
        patientMeaning: "Less smooth or accurate than it should be",
      },
    ],
  },
  balance_grade: {
    key: "balance_grade",
    name: "Functional balance grade",
    normal: "normal",
    options: [
      { value: "normal", short: "Normal", severity: 0, meaning: "Steady without support; accepts maximal challenge", patientMeaning: "Steady, even when pushed" },
      { value: "good", short: "Good", severity: 1, meaning: "Steady without support; accepts moderate challenge", patientMeaning: "Steady, copes with some challenge" },
      { value: "fair", short: "Fair", severity: 2, meaning: "Steady without support; cannot accept challenge", patientMeaning: "Steady only when still" },
      { value: "poor", short: "Poor", severity: 3, meaning: "Needs hand support or help to stay steady", patientMeaning: "Needs a hand or support" },
      { value: "zero", short: "Unable", severity: 4, meaning: "Needs maximal assistance; cannot hold the position", patientMeaning: "Cannot hold the position yet" },
    ],
  },
  romberg: {
    key: "romberg",
    name: "Romberg test",
    normal: "negative",
    options: [
      { value: "negative", short: "Negative", severity: 0, meaning: "Negative - steady with eyes closed", patientMeaning: "Steady with your eyes closed" },
      { value: "positive", short: "Positive", severity: 1, meaning: "Positive - sways or steps with eyes closed", patientMeaning: "Unsteady with your eyes closed" },
      { value: "unable", short: "Unable", severity: 2, meaning: "Unable to stand feet together to test", patientMeaning: "Not able to stand with feet together yet" },
    ],
  },
  berg_item: {
    key: "berg_item",
    name: "Berg Balance Scale item",
    normal: "4",
    options: [
      { value: "0", short: "0", severity: 4, meaning: "Unable, or needs maximal help" },
      { value: "1", short: "1", severity: 3, meaning: "Needs moderate help or close supervision" },
      { value: "2", short: "2", severity: 2, meaning: "Manages with supervision or limitation" },
      { value: "3", short: "3", severity: 1, meaning: "Manages with minor difficulty" },
      { value: "4", short: "4", severity: 0, meaning: "Manages independently and safely" },
    ],
  },
};

export function scaleOption(scale: NeuroScaleKey, value: string | undefined | null): ScaleOption | null {
  if (value === undefined || value === null) return null;
  return NEURO_SCALES[scale].options.find((o) => o.value === value) ?? null;
}

export function isScaleValue(scale: NeuroScaleKey, value: unknown): value is string {
  return typeof value === "string" && NEURO_SCALES[scale].options.some((o) => o.value === value);
}

/** 0 for normal; null when the value is not one of the scale's. */
export function severityOf(scale: NeuroScaleKey, value: string | undefined | null): number | null {
  return scaleOption(scale, value)?.severity ?? null;
}

// --- The bilateral sections -------------------------------------------------

export type NeuroRow = {
  /** Globally unique across every section -- it is the storage key. */
  key: string;
  label: string;
  /** A root level or a short qualifier, printed small beside the label. */
  detail?: string;
  /** Overrides the section's scale (the plantar row in Reflexes). */
  scale?: NeuroScaleKey;
};

export type BilateralSectionKey = "tone" | "power" | "reflexes" | "sensation" | "coordination";

export type BilateralSection = {
  key: BilateralSectionKey;
  title: string;
  /** The patient's word for the same section. */
  patientTitle: string;
  blurb: string;
  scale: NeuroScaleKey;
  groups: { title: string; rows: NeuroRow[] }[];
};

export const BILATERAL_SECTIONS: readonly BilateralSection[] = [
  {
    key: "tone",
    title: "Tone",
    patientTitle: "Muscle stiffness",
    blurb: "Modified Ashworth Scale, per muscle group, moved passively.",
    scale: "mas",
    groups: [
      {
        title: "Upper limb",
        rows: [
          { key: "tone_shoulder_adductors", label: "Shoulder adductors" },
          { key: "tone_elbow_flexors", label: "Elbow flexors" },
          { key: "tone_elbow_extensors", label: "Elbow extensors" },
          { key: "tone_wrist_flexors", label: "Wrist flexors" },
          { key: "tone_finger_flexors", label: "Finger flexors" },
        ],
      },
      {
        title: "Lower limb",
        rows: [
          { key: "tone_hip_adductors", label: "Hip adductors" },
          { key: "tone_knee_extensors", label: "Knee extensors" },
          { key: "tone_knee_flexors", label: "Knee flexors" },
          { key: "tone_ankle_plantarflexors", label: "Ankle plantarflexors" },
        ],
      },
    ],
  },
  {
    key: "power",
    title: "Power",
    patientTitle: "Muscle strength",
    blurb: "Oxford / MRC grade for each key muscle group (myotome).",
    scale: "mrc",
    groups: [
      {
        title: "Upper limb",
        rows: [
          { key: "power_shoulder_abduction", label: "Shoulder abduction", detail: "C5" },
          { key: "power_elbow_flexion", label: "Elbow flexion", detail: "C5-6" },
          { key: "power_wrist_extension", label: "Wrist extension", detail: "C6" },
          { key: "power_elbow_extension", label: "Elbow extension", detail: "C7" },
          { key: "power_finger_flexion", label: "Finger flexion", detail: "C8" },
          { key: "power_finger_abduction", label: "Finger abduction", detail: "T1" },
        ],
      },
      {
        title: "Lower limb",
        rows: [
          { key: "power_hip_flexion", label: "Hip flexion", detail: "L2" },
          { key: "power_knee_extension", label: "Knee extension", detail: "L3" },
          { key: "power_ankle_dorsiflexion", label: "Ankle dorsiflexion", detail: "L4" },
          { key: "power_great_toe_extension", label: "Great toe extension", detail: "L5" },
          { key: "power_ankle_plantarflexion", label: "Ankle plantarflexion", detail: "S1" },
        ],
      },
    ],
  },
  {
    key: "reflexes",
    title: "Reflexes",
    patientTitle: "Reflexes",
    blurb: "Deep tendon reflexes 0 to 4+, and the plantar response.",
    scale: "reflex",
    groups: [
      {
        title: "Deep tendon reflexes",
        rows: [
          { key: "reflex_biceps", label: "Biceps", detail: "C5-6" },
          { key: "reflex_brachioradialis", label: "Brachioradialis", detail: "C6" },
          { key: "reflex_triceps", label: "Triceps", detail: "C7" },
          { key: "reflex_knee", label: "Knee (patellar)", detail: "L3-4" },
          { key: "reflex_ankle", label: "Ankle (Achilles)", detail: "S1" },
        ],
      },
      {
        title: "Plantar",
        rows: [{ key: "reflex_plantar", label: "Plantar response", scale: "plantar" }],
      },
    ],
  },
  {
    key: "sensation",
    title: "Sensation",
    patientTitle: "Feeling (sensation)",
    blurb: "Intact, impaired or absent, per modality and region.",
    scale: "sensation",
    groups: [
      {
        title: "Light touch",
        rows: [
          { key: "sens_lt_upper_arm", label: "Upper arm" },
          { key: "sens_lt_forearm_hand", label: "Forearm and hand" },
          { key: "sens_lt_trunk", label: "Trunk" },
          { key: "sens_lt_thigh_leg", label: "Thigh and leg" },
          { key: "sens_lt_foot", label: "Foot" },
        ],
      },
      {
        title: "Pinprick",
        rows: [
          { key: "sens_pp_upper_arm", label: "Upper arm" },
          { key: "sens_pp_forearm_hand", label: "Forearm and hand" },
          { key: "sens_pp_trunk", label: "Trunk" },
          { key: "sens_pp_thigh_leg", label: "Thigh and leg" },
          { key: "sens_pp_foot", label: "Foot" },
        ],
      },
      {
        title: "Proprioception",
        rows: [
          { key: "sens_prop_fingers", label: "Fingers" },
          { key: "sens_prop_wrist", label: "Wrist" },
          { key: "sens_prop_great_toe", label: "Great toe" },
          { key: "sens_prop_ankle", label: "Ankle" },
        ],
      },
    ],
  },
  {
    key: "coordination",
    title: "Coordination",
    patientTitle: "Coordination",
    blurb: "Each limb tested on its own side.",
    scale: "coordination",
    groups: [
      {
        title: "Tests",
        rows: [
          { key: "coord_finger_nose", label: "Finger-nose" },
          { key: "coord_heel_shin", label: "Heel-shin" },
          { key: "coord_dysdiadochokinesia", label: "Rapid alternating movement", detail: "dysdiadochokinesia" },
        ],
      },
    ],
  },
];

export type ResolvedRow = NeuroRow & { section: BilateralSection; group: string; scale: NeuroScaleKey };

/** Every bilateral row, flattened, with its effective scale resolved. */
export const NEURO_ROWS: readonly ResolvedRow[] = BILATERAL_SECTIONS.flatMap((section) =>
  section.groups.flatMap((group) =>
    group.rows.map((row) => ({ ...row, section, group: group.title, scale: row.scale ?? section.scale }))
  )
);

const ROW_BY_KEY = new Map(NEURO_ROWS.map((row) => [row.key, row]));

export function neuroRow(key: string): ResolvedRow | null {
  return ROW_BY_KEY.get(key) ?? null;
}

// The storage keys are the contract with every row already written, so a
// duplicate is a bug that would silently merge two findings into one cell.
// Thrown at module load, the same posture conditionIntake.ts takes over
// intake keys.
if (ROW_BY_KEY.size !== NEURO_ROWS.length) {
  throw new Error("neuroExam: duplicate row key across the bilateral sections");
}

// --- Balance and gait ---------------------------------------------------------

export const BERG_ITEMS: readonly { key: string; label: string }[] = [
  { key: "1", label: "Sitting to standing" },
  { key: "2", label: "Standing unsupported" },
  { key: "3", label: "Sitting unsupported" },
  { key: "4", label: "Standing to sitting" },
  { key: "5", label: "Transfers" },
  { key: "6", label: "Standing with eyes closed" },
  { key: "7", label: "Standing with feet together" },
  { key: "8", label: "Reaching forward" },
  { key: "9", label: "Picking an object up from the floor" },
  { key: "10", label: "Turning to look behind" },
  { key: "11", label: "Turning 360 degrees" },
  { key: "12", label: "Placing alternate foot on a step" },
  { key: "13", label: "Standing with one foot in front" },
  { key: "14", label: "Standing on one leg" },
];
export const BERG_MAX = 56;
const BERG_ITEM_KEYS = new Set(BERG_ITEMS.map((i) => i.key));

export type BergBand = "high" | "medium" | "low";

/** Berg's own three bands (Berg et al.): 0-20 high fall risk (typically a
 *  wheelchair user), 21-40 medium (walks with assistance), 41-56 low
 *  (independent). */
export function bergRiskBand(total: number): BergBand {
  if (total <= 20) return "high";
  if (total <= 40) return "medium";
  return "low";
}

export const BERG_BAND_LABEL: Record<BergBand, string> = {
  high: "High fall risk",
  medium: "Medium fall risk",
  low: "Low fall risk",
};

export const BERG_BAND_MEANING: Record<BergBand, string> = {
  high: "0-20: typically needs a wheelchair",
  medium: "21-40: walks with assistance",
  low: "41-56: independent",
};

/** Timed Up and Go at or above this many seconds is the commonly used
 *  threshold for an increased risk of falls in community-dwelling adults. */
export const TUG_FALL_RISK_SECONDS = 13.5;

export type GaitSpeedBand = "household" | "limited" | "community";

/** Perry's ambulation categories, from the 10-metre walk test's speed. */
export function gaitSpeedBand(metresPerSecond: number): GaitSpeedBand {
  if (metresPerSecond < 0.4) return "household";
  if (metresPerSecond < 0.8) return "limited";
  return "community";
}

export const GAIT_SPEED_LABEL: Record<GaitSpeedBand, string> = {
  household: "Household walker (under 0.4 m/s)",
  limited: "Limited community walker (0.4-0.8 m/s)",
  community: "Community walker (0.8 m/s or more)",
};

/** Speed from a 10-metre walk time, to two decimals. */
export function gaitSpeedFromTenMetre(seconds: number): number {
  return Math.round((10 / seconds) * 100) / 100;
}

/** Shortest and longest timed test this chart accepts. Under a second for
 *  ten metres is faster than a sprinter; ten minutes is a test abandoned. */
export const TIMED_TEST_MIN_SECONDS = 1;
export const TIMED_TEST_MAX_SECONDS = 600;

export const GAIT_PATTERNS: readonly { key: string; label: string; meaning: string }[] = [
  { key: "normal", label: "Normal", meaning: "No gait deviation seen" },
  { key: "hemiplegic", label: "Hemiplegic", meaning: "Circumduction or hip hitch of the affected leg, reduced arm swing" },
  { key: "spastic_scissor", label: "Spastic / scissoring", meaning: "Stiff legs crossing the midline" },
  { key: "ataxic", label: "Ataxic", meaning: "Broad-based and unsteady, irregular steps" },
  { key: "parkinsonian", label: "Parkinsonian", meaning: "Shuffling, festinating, reduced arm swing, freezing" },
  { key: "steppage", label: "Steppage (foot drop)", meaning: "High stepping to clear a dropped foot" },
  { key: "trendelenburg", label: "Trendelenburg", meaning: "Pelvis drops on the side of the swinging leg" },
  { key: "antalgic", label: "Antalgic", meaning: "Shortened stance on a painful side" },
  { key: "waddling", label: "Waddling", meaning: "Side-to-side trunk sway from proximal weakness" },
  { key: "unable", label: "Unable to walk", meaning: "Not walking at present" },
];

export const GAIT_AIDS: readonly { key: string; label: string }[] = [
  { key: "none", label: "No aid" },
  { key: "stick", label: "Walking stick" },
  { key: "quad_stick", label: "Quad stick" },
  { key: "elbow_crutches", label: "Elbow crutches" },
  { key: "walking_frame", label: "Walking frame" },
  { key: "rollator", label: "Rollator" },
  { key: "afo", label: "Ankle-foot orthosis" },
  { key: "person_assist", label: "Help from a person" },
  { key: "wheelchair", label: "Wheelchair" },
];

/** Options that mean "nothing else applies" -- picking one clears the rest. */
export const EXCLUSIVE_GAIT_PATTERNS = new Set(["normal", "unable"]);
export const EXCLUSIVE_GAIT_AIDS = new Set(["none"]);

export const NEURO_NOTES_MAX = 4000;

// --- The stored shape ---------------------------------------------------------

export type SideValues = { left?: string; right?: string };

export type NeuroFindings = {
  bilateral: Record<string, SideValues>;
  balance: {
    romberg?: string;
    sitting?: string;
    standing?: string;
    bergTotal?: number;
    bergItems?: Record<string, number>;
  };
  gait: {
    patterns: string[];
    aids: string[];
    tenMetreWalkSeconds?: number;
    tugSeconds?: number;
  };
  notes?: string;
};

export function emptyNeuroFindings(): NeuroFindings {
  return { bilateral: {}, balance: {}, gait: { patterns: [], aids: [] } };
}

// --- Validation ---------------------------------------------------------------

export type ValidationResult = { ok: true; findings: NeuroFindings } | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownKeys(value: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(value).filter((k) => !allowed.includes(k));
}

/** A timed test to one decimal place, or an error sentence. */
function readSeconds(raw: unknown, label: string): { value?: number; error?: string } {
  if (raw === undefined || raw === null || raw === "") return {};
  if (typeof raw !== "number" || !Number.isFinite(raw)) return { error: `${label} must be a number of seconds.` };
  if (raw < TIMED_TEST_MIN_SECONDS || raw > TIMED_TEST_MAX_SECONDS) {
    return { error: `${label} must be between ${TIMED_TEST_MIN_SECONDS} and ${TIMED_TEST_MAX_SECONDS} seconds.` };
  }
  return { value: Math.round(raw * 10) / 10 };
}

function readChoiceList(
  raw: unknown,
  options: readonly { key: string; label: string }[],
  exclusive: Set<string>,
  label: string
): { value: string[]; error?: string } {
  const known = new Set(options.map((o) => o.key));
  if (raw === undefined || raw === null) return { value: [] };
  if (!Array.isArray(raw)) return { value: [], error: `${label} must be a list.` };
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !known.has(item)) return { value: [], error: `${label} contains an option this chart does not offer.` };
    if (!out.includes(item)) out.push(item);
  }
  const exclusiveChosen = out.filter((k) => exclusive.has(k));
  if (exclusiveChosen.length > 0 && out.length > 1) {
    const name = options.find((o) => o.key === exclusiveChosen[0])?.label ?? exclusiveChosen[0];
    return { value: [], error: `${label}: "${name}" cannot be combined with anything else.` };
  }
  return { value: out };
}

/**
 * The one judgement on what a submission may contain, used by both routes.
 * Refuses rather than repairs: an unknown row, a value its scale does not
 * offer or a Berg total that disagrees with its own items is a client the
 * server does not trust, never something to round into shape. The single
 * normalisation is dropping what was not tested (an empty side, an empty
 * note), which is how "not tested" is stored.
 */
export function validateNeuroFindings(raw: unknown): ValidationResult {
  if (!isPlainObject(raw)) return { ok: false, error: "The examination is missing or not readable." };
  const extra = unknownKeys(raw, ["bilateral", "balance", "gait", "notes"]);
  if (extra.length > 0) return { ok: false, error: "The examination contains fields this chart does not have." };

  const findings = emptyNeuroFindings();

  // Bilateral rows.
  const bilateral = raw.bilateral ?? {};
  if (!isPlainObject(bilateral)) return { ok: false, error: "The examination's scored findings are not readable." };
  for (const [key, sides] of Object.entries(bilateral)) {
    const row = neuroRow(key);
    if (!row) return { ok: false, error: "The examination contains a finding this chart does not have." };
    if (!isPlainObject(sides) || unknownKeys(sides, ["left", "right"]).length > 0) {
      return { ok: false, error: `${row.label}: only a left and a right value can be recorded.` };
    }
    const out: SideValues = {};
    for (const side of EXAM_SIDES) {
      const value = sides[side];
      if (value === undefined || value === null || value === "") continue;
      if (!isScaleValue(row.scale, value)) {
        return {
          ok: false,
          error: `${row.section.title} - ${row.label} (${side}): "${String(value)}" is not on the ${NEURO_SCALES[row.scale].name}.`,
        };
      }
      out[side] = value;
    }
    if (out.left !== undefined || out.right !== undefined) findings.bilateral[key] = out;
  }

  // Balance.
  const balance = raw.balance ?? {};
  if (!isPlainObject(balance)) return { ok: false, error: "The balance findings are not readable." };
  if (unknownKeys(balance, ["romberg", "sitting", "standing", "bergTotal", "bergItems"]).length > 0) {
    return { ok: false, error: "The balance findings contain a field this chart does not have." };
  }
  const single: [keyof NeuroFindings["balance"], NeuroScaleKey, string][] = [
    ["romberg", "romberg", "Romberg"],
    ["sitting", "balance_grade", "Sitting balance"],
    ["standing", "balance_grade", "Standing balance"],
  ];
  for (const [field, scale, label] of single) {
    const value = balance[field];
    if (value === undefined || value === null || value === "") continue;
    if (!isScaleValue(scale, value)) return { ok: false, error: `${label}: "${String(value)}" is not one of its grades.` };
    (findings.balance as Record<string, unknown>)[field] = value;
  }

  let itemSum = 0;
  let itemCount = 0;
  if (balance.bergItems !== undefined && balance.bergItems !== null) {
    if (!isPlainObject(balance.bergItems)) return { ok: false, error: "The Berg item scores are not readable." };
    const items: Record<string, number> = {};
    for (const [key, value] of Object.entries(balance.bergItems)) {
      if (!BERG_ITEM_KEYS.has(key)) return { ok: false, error: "The Berg scores contain an item the scale does not have." };
      if (value === null || value === undefined || value === "") continue;
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 4) {
        return { ok: false, error: `Berg item ${key} must be a whole number from 0 to 4.` };
      }
      items[key] = value;
      itemSum += value;
      itemCount += 1;
    }
    if (itemCount > 0) findings.balance.bergItems = items;
  }

  const rawTotal = balance.bergTotal;
  if (rawTotal !== undefined && rawTotal !== null && rawTotal !== "") {
    if (typeof rawTotal !== "number" || !Number.isInteger(rawTotal) || rawTotal < 0 || rawTotal > BERG_MAX) {
      return { ok: false, error: `The Berg total must be a whole number from 0 to ${BERG_MAX}.` };
    }
    if (itemCount === BERG_ITEMS.length && rawTotal !== itemSum) {
      return { ok: false, error: `The Berg total (${rawTotal}) does not match its fourteen item scores (${itemSum}).` };
    }
    const unscored = BERG_ITEMS.length - itemCount;
    if (itemCount > 0 && (rawTotal < itemSum || rawTotal > itemSum + unscored * 4)) {
      return {
        ok: false,
        error: `The Berg total (${rawTotal}) cannot come from the item scores recorded (${itemSum} so far, ${unscored} items unscored).`,
      };
    }
    findings.balance.bergTotal = rawTotal;
  } else if (itemCount === BERG_ITEMS.length) {
    // All fourteen scored and no total typed: the total is a sum, not a
    // judgement, so it is derived rather than refused.
    findings.balance.bergTotal = itemSum;
  }

  // Gait.
  const gait = raw.gait ?? {};
  if (!isPlainObject(gait)) return { ok: false, error: "The gait findings are not readable." };
  if (unknownKeys(gait, ["patterns", "aids", "tenMetreWalkSeconds", "tugSeconds"]).length > 0) {
    return { ok: false, error: "The gait findings contain a field this chart does not have." };
  }
  const patterns = readChoiceList(gait.patterns, GAIT_PATTERNS, EXCLUSIVE_GAIT_PATTERNS, "Gait pattern");
  if (patterns.error) return { ok: false, error: patterns.error };
  const aids = readChoiceList(gait.aids, GAIT_AIDS, EXCLUSIVE_GAIT_AIDS, "Walking aids");
  if (aids.error) return { ok: false, error: aids.error };
  findings.gait.patterns = patterns.value;
  findings.gait.aids = aids.value;
  const walk = readSeconds(gait.tenMetreWalkSeconds, "The 10-metre walk time");
  if (walk.error) return { ok: false, error: walk.error };
  const tug = readSeconds(gait.tugSeconds, "The Timed Up and Go");
  if (tug.error) return { ok: false, error: tug.error };
  if (patterns.value.includes("unable") && (walk.value !== undefined || tug.value !== undefined)) {
    return { ok: false, error: "A walking test cannot be timed for a patient recorded as unable to walk." };
  }
  if (walk.value !== undefined) findings.gait.tenMetreWalkSeconds = walk.value;
  if (tug.value !== undefined) findings.gait.tugSeconds = tug.value;

  // Notes.
  if (raw.notes !== undefined && raw.notes !== null) {
    if (typeof raw.notes !== "string") return { ok: false, error: "The clinical notes must be text." };
    const notes = raw.notes.trim();
    if (notes.length > NEURO_NOTES_MAX) {
      return { ok: false, error: `The clinical notes are too long - keep them under ${NEURO_NOTES_MAX} characters.` };
    }
    if (notes) findings.notes = notes;
  }

  if (isNeuroExamEmpty(findings)) {
    return { ok: false, error: "Record at least one finding before saving the examination." };
  }
  return { ok: true, findings };
}

export function isNeuroExamEmpty(f: NeuroFindings): boolean {
  return (
    Object.keys(f.bilateral).length === 0 &&
    f.balance.romberg === undefined &&
    f.balance.sitting === undefined &&
    f.balance.standing === undefined &&
    f.balance.bergTotal === undefined &&
    (f.balance.bergItems === undefined || Object.keys(f.balance.bergItems).length === 0) &&
    f.gait.patterns.length === 0 &&
    f.gait.aids.length === 0 &&
    f.gait.tenMetreWalkSeconds === undefined &&
    f.gait.tugSeconds === undefined &&
    !f.notes
  );
}

/** A stored row's findings for display. Stored rows were validated on the
 *  way in, so this only guards against a row from a later schema version or
 *  a hand edit: anything unreadable renders as an empty exam rather than
 *  taking the chart down. */
export function readStoredFindings(raw: unknown): NeuroFindings {
  const result = validateNeuroFindings(raw);
  return result.ok ? result.findings : emptyNeuroFindings();
}

/** The Berg total the form shows: typed, or summed once every item is in. */
export function bergTotalFromItems(items: Record<string, number> | undefined): number | null {
  if (!items) return null;
  const values = BERG_ITEMS.map((i) => items[i.key]).filter((v): v is number => typeof v === "number");
  if (values.length !== BERG_ITEMS.length) return null;
  return values.reduce((a, b) => a + b, 0);
}

// --- Reading it back ----------------------------------------------------------

export type Asymmetry = {
  rowKey: string;
  label: string;
  section: BilateralSectionKey;
  left: string;
  right: string;
  /** The side further from normal, or null when both are equally far
   *  (a 1+ against a 3+ reflex: different, neither "worse"). */
  moreAffected: ExamSide | null;
};

/**
 * Rows scored on both sides with different values. One grade is enough:
 * every scale here is coarse, so a one-step difference between sides is
 * already a clinical finding (a 4 against a 5 is the classic subtle
 * pyramidal weakness) -- a threshold of two would hide exactly that.
 */
export function asymmetries(findings: NeuroFindings): Asymmetry[] {
  const out: Asymmetry[] = [];
  for (const row of NEURO_ROWS) {
    const sides = findings.bilateral[row.key];
    if (!sides?.left || !sides.right || sides.left === sides.right) continue;
    const l = severityOf(row.scale, sides.left) ?? 0;
    const r = severityOf(row.scale, sides.right) ?? 0;
    out.push({
      rowKey: row.key,
      label: row.label,
      section: row.section.key,
      left: sides.left,
      right: sides.right,
      moreAffected: l === r ? null : l > r ? "left" : "right",
    });
  }
  return out;
}

export type SectionTally = { tested: number; abnormal: number; rows: number };

/** Per bilateral section: how many rows were examined (either side), how
 *  many showed anything other than normal, and how many the section has. */
export function sectionTallies(findings: NeuroFindings): Record<BilateralSectionKey, SectionTally> {
  const out = {} as Record<BilateralSectionKey, SectionTally>;
  for (const section of BILATERAL_SECTIONS) out[section.key] = { tested: 0, abnormal: 0, rows: 0 };
  for (const row of NEURO_ROWS) {
    const tally = out[row.section.key];
    tally.rows += 1;
    const sides = findings.bilateral[row.key];
    if (!sides || (sides.left === undefined && sides.right === undefined)) continue;
    tally.tested += 1;
    const abnormal = EXAM_SIDES.some((s) => (severityOf(row.scale, sides[s]) ?? 0) > 0);
    if (abnormal) tally.abnormal += 1;
  }
  return out;
}

/** Which side carries more of the abnormal findings, for one sentence at
 *  the top of the summary. Null when it is even, or nothing is abnormal. */
export function predominantSide(findings: NeuroFindings): ExamSide | null {
  let left = 0;
  let right = 0;
  for (const a of asymmetries(findings)) {
    if (a.moreAffected === "left") left += 1;
    if (a.moreAffected === "right") right += 1;
  }
  if (left === right) return null;
  return left > right ? "left" : "right";
}

export type NeuroHeadline = {
  berg: { total: number; band: BergBand } | null;
  tug: { seconds: number; atRisk: boolean } | null;
  walk: { seconds: number; speed: number; band: GaitSpeedBand } | null;
  asymmetryCount: number;
  abnormalCount: number;
  testedCount: number;
  predominantSide: ExamSide | null;
};

export function neuroHeadline(findings: NeuroFindings): NeuroHeadline {
  const tallies = Object.values(sectionTallies(findings));
  const { bergTotal } = findings.balance;
  const { tugSeconds, tenMetreWalkSeconds } = findings.gait;
  return {
    berg: bergTotal === undefined ? null : { total: bergTotal, band: bergRiskBand(bergTotal) },
    tug: tugSeconds === undefined ? null : { seconds: tugSeconds, atRisk: tugSeconds >= TUG_FALL_RISK_SECONDS },
    walk:
      tenMetreWalkSeconds === undefined
        ? null
        : (() => {
            const speed = gaitSpeedFromTenMetre(tenMetreWalkSeconds);
            return { seconds: tenMetreWalkSeconds, speed, band: gaitSpeedBand(speed) };
          })(),
    asymmetryCount: asymmetries(findings).length,
    abnormalCount: tallies.reduce((n, t) => n + t.abnormal, 0),
    testedCount: tallies.reduce((n, t) => n + t.tested, 0),
    predominantSide: predominantSide(findings),
  };
}

// --- Change since the previous exam ------------------------------------------

export type ChangeDirection = "better" | "worse" | "changed";

export type NeuroChange = {
  /** `${rowKey}:${side}` for a bilateral cell, or the balance/gait field. */
  id: string;
  label: string;
  from: string;
  to: string;
  direction: ChangeDirection;
};

export function changeId(rowKey: string, side: ExamSide): string {
  return `${rowKey}:${side}`;
}

function bySeverity(scale: NeuroScaleKey, from: string, to: string): ChangeDirection {
  const a = severityOf(scale, from) ?? 0;
  const b = severityOf(scale, to) ?? 0;
  if (b < a) return "better";
  if (b > a) return "worse";
  // Same distance from normal on the other side of it (1+ to 3+).
  return "changed";
}

const sideWord = (side: ExamSide) => (side === "left" ? "L" : "R");

/**
 * What moved between two examinations, for every finding recorded in BOTH.
 * Something tested only once is not a change -- "not tested last time" is
 * not "got worse" -- so a finding new to this exam is left out rather than
 * reported against a blank.
 */
export function compareNeuroExams(current: NeuroFindings, previous: NeuroFindings): NeuroChange[] {
  const out: NeuroChange[] = [];
  for (const row of NEURO_ROWS) {
    const now = current.bilateral[row.key];
    const before = previous.bilateral[row.key];
    if (!now || !before) continue;
    for (const side of EXAM_SIDES) {
      const to = now[side];
      const from = before[side];
      if (!to || !from || to === from) continue;
      out.push({
        id: changeId(row.key, side),
        label: `${row.section.title}: ${row.label} (${sideWord(side)})`,
        from,
        to,
        direction: bySeverity(row.scale, from, to),
      });
    }
  }

  const graded: [keyof NeuroFindings["balance"], NeuroScaleKey, string][] = [
    ["romberg", "romberg", "Romberg"],
    ["sitting", "balance_grade", "Sitting balance"],
    ["standing", "balance_grade", "Standing balance"],
  ];
  for (const [field, scale, label] of graded) {
    const to = current.balance[field] as string | undefined;
    const from = previous.balance[field] as string | undefined;
    if (!to || !from || to === from) continue;
    out.push({
      id: `balance.${field}`,
      label,
      from: scaleOption(scale, from)?.short ?? from,
      to: scaleOption(scale, to)?.short ?? to,
      direction: bySeverity(scale, from, to),
    });
  }

  const numeric: [string, number | undefined, number | undefined, string, "higher" | "lower", string][] = [
    ["balance.bergTotal", previous.balance.bergTotal, current.balance.bergTotal, "Berg Balance Scale", "higher", `/${BERG_MAX}`],
    ["gait.tugSeconds", previous.gait.tugSeconds, current.gait.tugSeconds, "Timed Up and Go", "lower", " s"],
    [
      "gait.tenMetreWalkSeconds",
      previous.gait.tenMetreWalkSeconds,
      current.gait.tenMetreWalkSeconds,
      "10-metre walk",
      "lower",
      " s",
    ],
  ];
  for (const [id, from, to, label, better, unit] of numeric) {
    if (from === undefined || to === undefined || from === to) continue;
    const improved = better === "higher" ? to > from : to < from;
    out.push({ id, label, from: `${from}${unit}`, to: `${to}${unit}`, direction: improved ? "better" : "worse" });
  }

  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  if (current.gait.patterns.length && previous.gait.patterns.length && !sameSet(current.gait.patterns, previous.gait.patterns)) {
    out.push({
      id: "gait.patterns",
      label: "Gait pattern",
      from: gaitPatternLabels(previous.gait.patterns).join(", "),
      to: gaitPatternLabels(current.gait.patterns).join(", "),
      direction: "changed",
    });
  }
  if (current.gait.aids.length && previous.gait.aids.length && !sameSet(current.gait.aids, previous.gait.aids)) {
    out.push({
      id: "gait.aids",
      label: "Walking aids",
      from: gaitAidLabels(previous.gait.aids).join(", "),
      to: gaitAidLabels(current.gait.aids).join(", "),
      direction: "changed",
    });
  }
  return out;
}

export function gaitPatternLabels(keys: string[]): string[] {
  return keys.map((k) => GAIT_PATTERNS.find((p) => p.key === k)?.label ?? k);
}

export function gaitAidLabels(keys: string[]): string[] {
  return keys.map((k) => GAIT_AIDS.find((a) => a.key === k)?.label ?? k);
}

/** Fills every row of a section that has not been scored with the scale's
 *  normal value -- the "everything else was normal" a clinician otherwise
 *  taps forty times. Never overwrites a value already chosen. */
export function markSectionNormal(
  bilateral: Record<string, SideValues>,
  section: BilateralSectionKey
): Record<string, SideValues> {
  const next: Record<string, SideValues> = { ...bilateral };
  for (const row of NEURO_ROWS) {
    if (row.section.key !== section) continue;
    const normal = NEURO_SCALES[row.scale].normal;
    const current = next[row.key] ?? {};
    next[row.key] = { left: current.left ?? normal, right: current.right ?? normal };
  }
  return next;
}

// --- As text (the patient's PDF export) ---------------------------------------

function cellText(scale: NeuroScaleKey, value: string | undefined): string {
  if (!value) return "not tested";
  const option = scaleOption(scale, value);
  return option ? `${option.short}` : value;
}

/**
 * The exam as lines of text, for a document handed to another clinician.
 * Only what was examined is printed, each scale named once per section so a
 * receiving clinician knows what "1+" was measured on.
 */
export function describeNeuroExamForText(findings: NeuroFindings): string[] {
  const lines: string[] = [];
  for (const section of BILATERAL_SECTIONS) {
    const rows = NEURO_ROWS.filter((r) => r.section.key === section.key && findings.bilateral[r.key]);
    if (rows.length === 0) continue;
    const scaleName = NEURO_SCALES[section.scale].name;
    lines.push(`${section.title}${scaleName === section.title ? "" : ` (${scaleName})`} - left / right:`);
    for (const row of rows) {
      const sides = findings.bilateral[row.key];
      lines.push(`  ${row.group === "Tests" ? "" : `${row.group}, `}${row.label}: ${cellText(row.scale, sides.left)} / ${cellText(row.scale, sides.right)}`);
    }
  }
  const { balance, gait } = findings;
  const balanceBits: string[] = [];
  if (balance.romberg) balanceBits.push(`Romberg ${scaleOption("romberg", balance.romberg)?.short.toLowerCase()}`);
  if (balance.sitting) balanceBits.push(`sitting ${scaleOption("balance_grade", balance.sitting)?.short.toLowerCase()}`);
  if (balance.standing) balanceBits.push(`standing ${scaleOption("balance_grade", balance.standing)?.short.toLowerCase()}`);
  if (balance.bergTotal !== undefined) {
    balanceBits.push(`Berg ${balance.bergTotal}/${BERG_MAX} (${BERG_BAND_LABEL[bergRiskBand(balance.bergTotal)].toLowerCase()})`);
  }
  if (balanceBits.length) lines.push(`Balance: ${balanceBits.join(", ")}`);
  const gaitBits: string[] = [];
  if (gait.patterns.length) gaitBits.push(gaitPatternLabels(gait.patterns).join(", "));
  if (gait.aids.length) gaitBits.push(`aids: ${gaitAidLabels(gait.aids).join(", ").toLowerCase()}`);
  if (gait.tenMetreWalkSeconds !== undefined) {
    gaitBits.push(`10-metre walk ${gait.tenMetreWalkSeconds} s (${gaitSpeedFromTenMetre(gait.tenMetreWalkSeconds)} m/s)`);
  }
  if (gait.tugSeconds !== undefined) gaitBits.push(`Timed Up and Go ${gait.tugSeconds} s`);
  if (gaitBits.length) lines.push(`Gait: ${gaitBits.join("; ")}`);
  if (findings.notes) lines.push(`Notes: ${findings.notes}`);
  return lines;
}

// --- Rows as read from the table ----------------------------------------------

export type NeuroAssessmentRow = {
  id: string;
  created_at: string;
  submitted_by_role: string;
  schema_version: number | null;
  findings: unknown;
};

export type ParsedNeuroAssessment = {
  id: string;
  createdAt: string;
  submittedByRole: string;
  findings: NeuroFindings;
};

/** Newest first, findings parsed. */
export function parseNeuroAssessments(rows: NeuroAssessmentRow[]): ParsedNeuroAssessment[] {
  return [...rows]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      submittedByRole: row.submitted_by_role,
      findings: readStoredFindings(row.findings),
    }));
}
