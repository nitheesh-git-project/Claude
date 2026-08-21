// Pain Map: the 17-region body diagram a therapist fills in after
// examining a patient (see supabase/schema.sql's pain_assessments /
// pain_map_question_templates section for the data model, and
// AGENTS.md's "Business math lives in dependency-free src/lib modules").
//
// Region content is split into a generic question set that applies to
// every region, plus a handful of region-specific keys (trigger, function,
// movement_pain, special_test) whose wording changes per region. This is
// the code-level default; an admin can override any single question's
// wording via pain_map_question_templates without redeploying — see
// mergeQuestionOverrides below.

export type PainMapView = "front" | "back";
export type PainMapSide = "left" | "right" | "na";

export type PainMapRegionKey =
  | "neck"
  | "shoulder"
  | "upper_back"
  | "lower_back"
  | "chest"
  | "abs_core"
  | "biceps"
  | "triceps"
  | "elbow"
  | "wrist_hand"
  | "hip"
  | "glutes"
  | "quads"
  | "hamstrings"
  | "knee"
  | "calves"
  | "ankle_foot";

export type PainMapRegionDef = {
  key: PainMapRegionKey;
  label: string;
  view: PainMapView;
  // Whether this region exists on both sides of the body (needs a `side`
  // when submitting an assessment) or is a single midline structure.
  paired: boolean;
};

// Order matches the visual top-to-bottom label stack on the reference
// diagram — back view first, then front — see the published Pain Map
// artifact from the design pass.
export const PAIN_MAP_REGIONS: PainMapRegionDef[] = [
  { key: "neck", label: "Neck", view: "back", paired: false },
  { key: "upper_back", label: "Upper back", view: "back", paired: false },
  { key: "triceps", label: "Triceps", view: "back", paired: true },
  { key: "lower_back", label: "Lower back", view: "back", paired: false },
  { key: "glutes", label: "Glutes", view: "back", paired: false },
  { key: "hamstrings", label: "Hamstrings", view: "back", paired: true },
  { key: "calves", label: "Calves", view: "back", paired: true },
  { key: "shoulder", label: "Shoulder", view: "front", paired: true },
  { key: "chest", label: "Chest", view: "front", paired: false },
  { key: "biceps", label: "Biceps", view: "front", paired: true },
  { key: "elbow", label: "Elbow", view: "front", paired: true },
  { key: "abs_core", label: "Abs / Core", view: "front", paired: false },
  { key: "wrist_hand", label: "Wrist / Hand", view: "front", paired: true },
  { key: "hip", label: "Hip", view: "front", paired: true },
  { key: "quads", label: "Quads", view: "front", paired: true },
  { key: "knee", label: "Knee", view: "front", paired: true },
  { key: "ankle_foot", label: "Ankle / Foot", view: "front", paired: true },
];

// The 20 questions in clinical order, grouped the way a physiotherapist
// actually works through an examination rather than as one undifferentiated
// list. Recording an exam used to render all twenty fields at once, which is
// the same "wall of fields reads as paperwork" problem the patient intake
// was rebuilt to avoid -- the clinician just got a bigger wall.
//
// Groups, not steps: a therapist doing this after every session wants speed,
// so the whole exam stays on one surface with headings to scan by, instead
// of being paced one question at a time the way a patient's once-ever
// intake is.
export type PainExamGroupKey = "complaint" | "pattern" | "measured" | "findings";

export type PainExamGroupDef = {
  key: PainExamGroupKey;
  title: string;
  blurb: string;
  /** Question keys in this group, in the order they should appear. */
  questionKeys: string[];
};

export const PAIN_EXAM_GROUPS: PainExamGroupDef[] = [
  {
    key: "complaint",
    title: "What they describe",
    blurb: "The complaint in the patient's own words.",
    questionKeys: ["location", "onset", "pain_type", "pattern", "radiates"],
  },
  {
    key: "pattern",
    title: "What sets it off",
    blurb: "Triggers, relief, and anything in their history that bears on it.",
    questionKeys: ["trigger", "worse", "better", "associated", "history", "function"],
  },
  {
    key: "measured",
    title: "Pain on testing",
    blurb: "What they scored while you moved them.",
    questionKeys: ["rest_pain", "movement_pain", "night_pain"],
  },
  {
    key: "findings",
    title: "Your findings",
    blurb: "What you observed and measured yourself.",
    questionKeys: ["rom", "strength", "swelling", "palpation", "special_test", "movement_note"],
  },
];

/** Groups a merged question list into PAIN_EXAM_GROUPS, keeping any key the
 *  groups don't name in a final catch-all so an admin-added question can
 *  never silently vanish from the form. */
export function groupExamQuestions(
  questions: QuestionTemplate[]
): { group: PainExamGroupDef; questions: QuestionTemplate[] }[] {
  const byKey = new Map(questions.map((q) => [q.key, q]));
  const claimed = new Set<string>();
  const grouped = PAIN_EXAM_GROUPS.map((group) => {
    const found = group.questionKeys
      .map((key) => {
        const q = byKey.get(key);
        if (q) claimed.add(key);
        return q;
      })
      .filter((q): q is QuestionTemplate => !!q);
    return { group, questions: found };
  }).filter((g) => g.questions.length > 0);

  const leftovers = questions.filter((q) => !claimed.has(q.key));
  if (leftovers.length > 0) {
    grouped.push({
      group: {
        key: "findings",
        title: "Anything else",
        blurb: "Questions added for this region by an admin.",
        questionKeys: leftovers.map((q) => q.key),
      },
      questions: leftovers,
    });
  }
  return grouped;
}

/**
 * An exam score, written the way the patient already reads pain.
 *
 * Assessments are stored 0-100 while a patient rates their own pain 0-10,
 * and both used to be printed raw on the same screens -- "How you rate it
 * 6/10" sat directly beside "Last exam found 34%" in the same strip of four
 * figures. Two units for one concept reads as two different measurements,
 * so every user-facing exam figure goes through this. Storage is untouched:
 * this is a display concern only.
 */
export function formatPainOutOfTen(percent: number): string {
  const outOfTen = percent / 10;
  // Whole numbers stay whole -- "5/10" not "5.0/10" -- so the common case
  // reads exactly like the patient's own answer.
  return `${Number.isInteger(outOfTen) ? outOfTen : outOfTen.toFixed(1)}/10`;
}

export function isPainMapRegion(value: string): value is PainMapRegionKey {
  return PAIN_MAP_REGIONS.some((r) => r.key === value);
}

export function regionRequiresSide(region: PainMapRegionKey): boolean {
  return PAIN_MAP_REGIONS.find((r) => r.key === region)?.paired ?? false;
}

export type QuestionInputType = "text" | "scale_0_10" | "yes_no" | "select";

export type QuestionTemplate = {
  key: string;
  text: string;
  inputType: QuestionInputType;
  options?: string[];
  order: number;
};

// The keys whose wording varies per region — everything else in
// GENERIC_QUESTIONS is shared verbatim across all 17 regions.
type RegionSpecificKey = "trigger" | "function" | "movement_pain" | "special_test";

const GENERIC_QUESTIONS: Omit<QuestionTemplate, "text">[] = [
  { key: "location", inputType: "text", order: 1 },
  { key: "onset", inputType: "text", order: 2 },
  {
    key: "pain_type",
    inputType: "select",
    options: ["Sharp", "Dull ache", "Burning", "Throbbing", "Stiffness", "Numbness", "Tingling"],
    order: 3,
  },
  { key: "trigger", inputType: "text", order: 4 },
  { key: "worse", inputType: "text", order: 5 },
  { key: "better", inputType: "text", order: 6 },
  { key: "pattern", inputType: "select", options: ["Constant", "Comes and goes"], order: 7 },
  { key: "radiates", inputType: "yes_no", order: 8 },
  { key: "associated", inputType: "text", order: 9 },
  { key: "history", inputType: "text", order: 10 },
  { key: "function", inputType: "text", order: 11 },
  { key: "rest_pain", inputType: "scale_0_10", order: 12 },
  { key: "movement_pain", inputType: "scale_0_10", order: 13 },
  { key: "night_pain", inputType: "yes_no", order: 14 },
  {
    key: "rom",
    inputType: "select",
    options: ["Normal", "Mild restriction", "Moderate restriction", "Severe restriction"],
    order: 15,
  },
  {
    key: "strength",
    inputType: "select",
    options: ["Normal", "Mild weakness", "Moderate weakness", "Severe weakness / cannot hold"],
    order: 16,
  },
  { key: "swelling", inputType: "yes_no", order: 17 },
  { key: "palpation", inputType: "text", order: 18 },
  { key: "special_test", inputType: "select", options: ["Positive", "Negative", "Not tested"], order: 19 },
  { key: "movement_note", inputType: "text", order: 20 },
];

const GENERIC_TEXT: Record<string, string> = {
  location: "Where exactly in this area — which part?",
  onset: "When did this start, and was it sudden or gradual?",
  pain_type: "What kind of pain is it?",
  worse: "What makes it worse?",
  better: "What makes it better (rest, ice, heat, medication)?",
  pattern: "Is the pain constant, or does it come and go?",
  radiates: "Does the pain spread to a nearby area?",
  associated: "Any swelling, weakness, numbness, or stiffness alongside the pain?",
  history: "Any prior injury or surgery in this area?",
  rest_pain: "Pain level at rest (0 = none, 10 = worst pain imaginable)",
  night_pain: "Does the pain wake you at night or get worse lying down?",
  rom: "Range of motion on this side",
  strength: "Strength on manual / functional testing",
  swelling: "Visible swelling or deformity?",
  palpation: "Where is it most tender to touch?",
  movement_note: "Any other observation about movement quality or compensation?",
};

const REGION_TEXT: Record<PainMapRegionKey, Record<RegionSpecificKey, string>> = {
  neck: {
    trigger: "Does turning your head side to side, or looking up and down, bring it on?",
    function: "Can you check traffic over your shoulder, or look down at your phone, without pain?",
    movement_pain: "Rate the pain as you slowly turn your head side to side and tilt up/down (0–10)",
    special_test: "Pain reproduced on active rotation/extension overpressure?",
  },
  shoulder: {
    trigger: "Does raising your arm overhead, or reaching behind your back, bring it on?",
    function: "Can you reach a shelf, or fasten something behind your back, without pain?",
    movement_pain: "Rate the pain as you raise your arm overhead slowly (0–10)",
    special_test: "Painful arc — pain between roughly 60–120° of raising the arm?",
  },
  upper_back: {
    trigger: "Does sitting for long periods, or twisting your torso, bring it on?",
    function: "Can you sit at a desk, or turn to look behind you, without pain?",
    movement_pain: "Rate the pain during seated trunk rotation and extension (0–10)",
    special_test: "Pain reproduced on thoracic extension/rotation overpressure?",
  },
  lower_back: {
    trigger: "Does bending forward, lifting, or sitting for long periods bring it on?",
    function: "Can you pick something off the floor, or stand up from sitting, without pain?",
    movement_pain: "Rate the pain during a forward bend and standing back up (0–10)",
    special_test: "Straight leg raise — pain reproduced down the leg?",
  },
  chest: {
    trigger: "Does deep breathing, coughing, or pushing/pressing movements bring it on?",
    function: "Can you take a full deep breath, or push open a heavy door, without pain?",
    movement_pain: "Rate the pain with a resisted push motion or deep breath (0–10)",
    special_test: "Resisted horizontal arm adduction — pain reproduced?",
  },
  abs_core: {
    trigger: "Does sitting up, coughing or sneezing, or twisting bring it on?",
    function: "Can you get up from lying down, or cough, without pain?",
    movement_pain: "Rate the pain during a partial sit-up / trunk flexion (0–10)",
    special_test: "Resisted trunk flexion — pain reproduced?",
  },
  biceps: {
    trigger: "Does lifting something palm-up, or bending your elbow against resistance, bring it on?",
    function: "Can you carry a bag, or lift a cup to your mouth, without pain?",
    movement_pain: "Rate the pain during resisted elbow flexion (0–10)",
    special_test: "Speed's test — pain reproduced?",
  },
  triceps: {
    trigger:
      "Does straightening your arm against resistance bring it on — like pushing a door, or getting up from a chair?",
    function: "Can you push yourself up from a chair, or straighten your arm fully, without pain?",
    movement_pain: "Rate the pain as you extend your elbow against light resistance (0–10)",
    special_test: "Resisted elbow extension test — pain reproduced?",
  },
  elbow: {
    trigger: "Does gripping, twisting a doorknob or jar lid, or bending/straightening the elbow bring it on?",
    function: "Can you carry a bag, or shake hands firmly, without pain?",
    movement_pain: "Rate the pain during resisted wrist extension or flexion (0–10)",
    special_test: "Resisted wrist extension (lateral) / flexion (medial) — pain reproduced?",
  },
  wrist_hand: {
    trigger: "Does typing, gripping, or bending the wrist bring it on?",
    function: "Can you write, type, or open a jar without pain?",
    movement_pain: "Rate the pain during wrist flexion/extension against resistance (0–10)",
    special_test: "Tinel's / Phalen's test — pain or tingling reproduced?",
  },
  hip: {
    trigger: "Does walking, climbing stairs, or getting up from a low chair bring it on?",
    function: "Can you climb stairs, or get in and out of a car, without pain?",
    movement_pain: "Rate the pain during hip flexion and rotation (0–10)",
    special_test: "FABER test — pain reproduced?",
  },
  glutes: {
    trigger: "Does sitting for long periods, or climbing stairs, bring it on?",
    function: "Can you sit through a long drive, or climb stairs, without pain?",
    movement_pain: "Rate the pain during resisted hip extension (0–10)",
    special_test: "Resisted hip extension / sciatic notch palpation — pain reproduced?",
  },
  quads: {
    trigger: "Does going up or down stairs, squatting, or kicking bring it on?",
    function: "Can you squat down, or walk downstairs, without pain?",
    movement_pain: "Rate the pain during resisted knee extension (0–10)",
    special_test: "Resisted knee extension — pain reproduced?",
  },
  hamstrings: {
    trigger: "Does bending forward, sprinting, or stretching the back of your thigh bring it on?",
    function: "Can you bend down to tie your shoes, or walk briskly, without pain?",
    movement_pain: "Rate the pain during resisted knee flexion (0–10)",
    special_test: "Resisted knee flexion / passive stretch — pain reproduced?",
  },
  knee: {
    trigger: "Does going up or down stairs, squatting, or twisting the knee bring it on?",
    function: "Can you kneel, squat, or climb stairs, without pain?",
    movement_pain: "Rate the pain during active knee flexion/extension (0–10)",
    special_test: "McMurray's test (if locking/catching) or single-leg squat — pain reproduced?",
  },
  calves: {
    trigger: "Does walking, running, or going up on your toes bring it on?",
    function: "Can you walk briskly, or stand on your toes, without pain?",
    movement_pain: "Rate the pain during a resisted calf raise (0–10)",
    special_test: "Calf raise test / passive dorsiflexion stretch — pain reproduced?",
  },
  ankle_foot: {
    trigger: "Does walking on uneven ground, or rolling/twisting your ankle, bring it on?",
    function: "Can you walk, or stand for a while, without pain?",
    movement_pain: "Rate the pain during active ankle movement while weight-bearing (0–10)",
    special_test: "Anterior drawer test / passive stretch — pain reproduced?",
  },
};

/** The code-level default question set for one region, before any admin overrides. */
export function getDefaultQuestionsForRegion(region: PainMapRegionKey): QuestionTemplate[] {
  const regionText = REGION_TEXT[region];
  return GENERIC_QUESTIONS.map((q) => ({
    ...q,
    text: regionText[q.key as RegionSpecificKey] ?? GENERIC_TEXT[q.key] ?? q.key,
  })).sort((a, b) => a.order - b.order);
}

export type QuestionOverrideRow = { question_key: string; question_text: string };

/** Applies admin-edited wording from pain_map_question_templates on top of
 *  the code defaults. Only question_text is overridable — input type and
 *  order stay code-defined so an edit can't corrupt how the form renders. */
export function mergeQuestionOverrides(
  defaults: QuestionTemplate[],
  overrides: QuestionOverrideRow[]
): QuestionTemplate[] {
  const overrideMap = new Map(overrides.map((o) => [o.question_key, o.question_text]));
  return defaults.map((q) => ({ ...q, text: overrideMap.get(q.key) ?? q.text }));
}

export type PainBand = "low" | "mid" | "high";

export function painBand(percent: number): PainBand {
  if (percent <= 33) return "low";
  if (percent <= 66) return "mid";
  return "high";
}

export const PAIN_BAND_LABEL: Record<PainBand, string> = {
  low: "Low",
  mid: "Moderate",
  high: "High",
};

export type PainAssessmentRow = {
  region: string;
  side: string;
  pain_percent: number;
  created_at: string;
  // Optional -- older call sites that only select the four fields above
  // still satisfy this type; callers that want "who assessed this" (the
  // popup, the comparison view) select it explicitly.
  submitted_by_role?: string;
};

/** Latest row per (region, side), keyed "region:side" — the shape every
 *  Pain Map display (diagram dots, summary list, admin grid) needs, built
 *  once here instead of three slightly different reimplementations. */
export function latestAssessmentByRegionSide(
  assessments: PainAssessmentRow[]
): Map<string, PainAssessmentRow> {
  const latest = new Map<string, PainAssessmentRow>();
  for (const a of assessments) {
    const key = `${a.region}:${a.side}`;
    const existing = latest.get(key);
    if (!existing || new Date(a.created_at).getTime() > new Date(existing.created_at).getTime()) {
      latest.set(key, a);
    }
  }
  return latest;
}

/** Every row for one (region, side), newest first -- the popup's "full
 *  history" list and sparkline both want the same ordering. */
export function historyForRegionSide(
  assessments: PainAssessmentRow[],
  region: string,
  side: string
): PainAssessmentRow[] {
  return assessments
    .filter((a) => a.region === region && a.side === side)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export type PainTrend = "up" | "down" | "flat" | "new";

/** Compares the latest assessment's percent against the one before it for
 *  the same region+side. `previousPercent` is null on a region's very
 *  first assessment, where there's nothing to trend against yet. */
export function painTrend(latestPercent: number, previousPercent: number | null): PainTrend {
  if (previousPercent === null) return "new";
  if (latestPercent === previousPercent) return "flat";
  return latestPercent < previousPercent ? "down" : "up";
}
