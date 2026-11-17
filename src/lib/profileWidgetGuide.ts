// Settings -> Health Profile layout: for every section a patient can be
// shown, what it is, why it helps, how its data gets in, and a small preview
// with sample data as the patient sees it. Sample data only -- named as such
// on screen. Dependency-free apart from the two registries it describes,
// and tested so no section is ever left without a guide.

import { OUTCOME_MEASURES } from "@/lib/outcomeMeasures";
import { GRAPH_LINE_PREFIX, PROFILE_WIDGETS, type ProfileWidget } from "@/lib/profileWidgets";

export type GuidePreview =
  | { kind: "tiles"; items: { label: string; value: string }[] }
  | { kind: "list"; items: string[] }
  | { kind: "bars"; items: { label: string; value: number; note?: string }[] }
  | { kind: "line"; label: string; unit: string; points: number[]; min: number; max: number; better: "up" | "down" }
  | { kind: "text"; text: string }
  | { kind: "pill"; label: string; tone: "green" | "amber" | "red"; note: string };

export type WidgetGuide = {
  what: string;
  why: string;
  /** Who puts the data there, and where. */
  how: string;
  preview: GuidePreview;
};

const T = "the physiotherapist";

const SECTIONS: Record<string, WidgetGuide> = {
  status_header: {
    what: "The top of the page: the patient's name, where they are in treatment, and their physiotherapist's one-line summary.",
    why: "It answers \"how am I doing?\" before anything else, and carries any red flag that needs attention.",
    how: `Filled by ${T} after each session (the summary and phase); red flags come from the patient's answers.`,
    preview: { kind: "pill", label: "Getting stronger - week 4", tone: "green", note: "Knee pain easing; keep the evening stretches." },
  },
  home_exercises: {
    what: "The exercises to do at home, how often, and what to watch for.",
    why: "It is the plan between sessions - and it carries the safety lines for exercising alone.",
    how: `${T} publishes it from the session screen; it updates the moment they change it.`,
    preview: { kind: "list", items: ["Heel slides - 2 x 10, morning and evening", "Straight-leg raise - 3 x 8", "Stop if pain goes above 5/10"] },
  },
  fall_risk: {
    what: "The patient's fall-risk level and the rule that decided it.",
    why: "Falls are the biggest risk for these patients; seeing the level keeps it in mind at home.",
    how: `Worked out from the balance tests and fall history ${T} records.`,
    preview: { kind: "pill", label: "Moderate fall risk", tone: "amber", note: "Timed Up and Go 14 s - one fall this year." },
  },
  orthostatic: {
    what: "Whether blood pressure drops on standing up.",
    why: "A drop means getting up slowly - a simple rule that prevents falls.",
    how: `${T} measures lying and standing blood pressure at a review.`,
    preview: { kind: "tiles", items: [{ label: "Lying", value: "132/80" }, { label: "Standing", value: "118/74" }, { label: "Drop", value: "14 mmHg" }] },
  },
  cardio_safety: {
    what: "The patient's own exercise limits, any flagged reading, and when to stop and tell someone.",
    why: "Heart and lung patients exercise safely only inside their limits.",
    how: `${T} sets the limits; readings come from reviews and the patient's diary.`,
    preview: { kind: "list", items: ["Keep heart rate under 120", "Stop if chest pain or dizziness", "Last reading: SpO2 94% - fine"] },
  },
  precautions: {
    what: "What not to do yet after an operation, and until when.",
    why: "Surgeons' restrictions protect the repair; the patient sees them every time.",
    how: `${T} copies them from the surgeon's notes at onboarding.`,
    preview: { kind: "list", items: ["No kneeling until 12 Dec", "No twisting on the operated leg"] },
  },
  key_numbers: {
    what: "Four tiles with the latest figure for each headline measure.",
    why: "Progress in one glance, without reading a chart.",
    how: `The latest value of each measure ${T} records at reviews.`,
    preview: { kind: "tiles", items: [{ label: "Pain", value: "3/10" }, { label: "Knee bend", value: "115°" }, { label: "Strength", value: "92%" }, { label: "Function", value: "64/80" }] },
  },
  progress_graph: {
    what: "\"Are you getting better?\" - one dot per review against the goal band.",
    why: "Seeing the line move is what keeps people doing their exercises.",
    how: `Each review ${T} records adds a dot; the measures below choose which lines it draws.`,
    preview: { kind: "line", label: "Pain", unit: "/10", points: [7, 6, 6, 4, 3], min: 0, max: 10, better: "down" },
  },
  steps: {
    what: "The goal the physiotherapist set and the steps towards it.",
    why: "A goal in the patient's own words, broken into steps they can tick off.",
    how: `${T} writes the goal and steps; steps tick off at reviews.`,
    preview: { kind: "list", items: ["Goal: climb the stairs without wincing", "✓ Walk 10 minutes without a break", "→ One flight with the rail"] },
  },
  measures_table: {
    what: "First reading, latest reading and goal for every measure.",
    why: "The detail behind the graph, for patients who like the numbers.",
    how: `Every measure ${T} records at a review.`,
    preview: { kind: "tiles", items: [{ label: "Pain - first", value: "7" }, { label: "Latest", value: "3" }, { label: "Goal", value: "2" }] },
  },
  body_map: {
    what: "The body map with each painful area, the knee-bend and strength visuals.",
    why: "Where it hurts, and how that has changed, drawn on a body.",
    how: "The patient marks the Pain Map; the physiotherapist adds the range and strength at reviews.",
    preview: { kind: "bars", items: [{ label: "Left knee", value: 30, note: "3/10" }, { label: "Lower back", value: 10, note: "1/10" }] },
  },
  exam_picture: {
    what: "The neurological examination, the affected side and the walking ladder.",
    why: "Explains what the stroke or condition changed, and the next walking step.",
    how: `${T} fills it at onboarding and updates it at reviews.`,
    preview: { kind: "list", items: ["Affected side: right", "Walking: with a stick, indoors", "Next: short walks outside"] },
  },
  parkinsons_symptoms: {
    what: "Which Parkinson's symptoms lead, and the stage.",
    why: "Exercises target the leading symptom; the stage sets expectations.",
    how: `${T} records it at onboarding and reviews.`,
    preview: { kind: "tiles", items: [{ label: "Leading", value: "Stiffness" }, { label: "Stage", value: "2" }] },
  },
  milestone_chart: {
    what: "The milestone windows chart and the list of what the child does on their own.",
    why: "Parents see where their child is against the usual age windows.",
    how: `${T} records milestones at each review.`,
    preview: { kind: "list", items: ["✓ Sits without support", "✓ Pulls to stand", "→ Walks holding on"] },
  },
  steadi_tests: {
    what: "Four short tests of balance, strength and walking.",
    why: "They show balance improving, which is what lowers fall risk.",
    how: `${T} runs them at reviews.`,
    preview: { kind: "tiles", items: [{ label: "Chair stands", value: "9" }, { label: "Up and Go", value: "12 s" }, { label: "Balance", value: "Level 3" }] },
  },
  daily_living: {
    what: "How much of washing, dressing and moving about is managed alone.",
    why: "Independence at home is the outcome that matters most to families.",
    how: `${T} scores it at reviews.`,
    preview: { kind: "bars", items: [{ label: "Dressing", value: 80, note: "alone" }, { label: "Bathing", value: 50, note: "some help" }] },
  },
  home_safety: {
    what: "The checklist of hazards at home.",
    why: "Most falls happen at home; fixing a rug prevents one.",
    how: `${T} goes through it with the patient on a visit or call.`,
    preview: { kind: "list", items: ["✓ Rail on the stairs", "✗ Loose rug in the hall", "✓ Night light"] },
  },
  walk_track: {
    what: "How far the patient walked in six minutes, against what is expected.",
    why: "The clearest sign of heart-lung fitness improving.",
    how: `${T} times the walk at reviews.`,
    preview: { kind: "line", label: "Six-minute walk", unit: " m", points: [285, 310, 334, 372], min: 200, max: 500, better: "up" },
  },
  oxygen: {
    what: "Oxygen level at the latest reviews, against the patient's own limit.",
    why: "Shows exercise is safe, and flags a worrying drop.",
    how: `${T} records it at reviews.`,
    preview: { kind: "tiles", items: [{ label: "Resting", value: "96%" }, { label: "After walk", value: "92%" }, { label: "Limit", value: "88%" }] },
  },
  effort: {
    what: "The effort and heart-rate range to exercise in.",
    why: "\"Hard enough, not too hard\" in a number the patient can check.",
    how: `${T} sets it from the walk test.`,
    preview: { kind: "tiles", items: [{ label: "Effort", value: "12-14 / 20" }, { label: "Heart rate", value: "100-118" }] },
  },
  vitals: {
    what: "Heart rate and blood pressure at the latest reviews.",
    why: "A quick check that the body is coping with the exercise.",
    how: `${T} records them at reviews.`,
    preview: { kind: "tiles", items: [{ label: "Heart rate", value: "78" }, { label: "Blood pressure", value: "126/80" }] },
  },
  breathlessness: {
    what: "How breathless everyday activity makes the patient.",
    why: "Less breathless doing the same things is real progress.",
    how: `${T} grades it at reviews.`,
    preview: { kind: "pill", label: "Grade 2", tone: "amber", note: "Breathless walking up a slight hill." },
  },
  diary: {
    what: "Falls and near misses the patient wrote down, and the list of entries.",
    why: "Patterns in the diary tell the physiotherapist what to work on.",
    how: "The patient writes entries from their dashboard.",
    preview: { kind: "list", items: ["12 Nov - near miss getting out of bed", "5 Nov - no falls this week"] },
  },
  freezing_chart: {
    what: "Twelve weeks of feet getting stuck, from the diary.",
    why: "Shows whether freezing episodes are becoming rarer.",
    how: "Counted from the patient's diary entries.",
    preview: { kind: "bars", items: [{ label: "This week", value: 30, note: "3" }, { label: "4 weeks ago", value: 60, note: "6" }] },
  },
  active_minutes: {
    what: "Active minutes a week from the diary, against the 150-minute aim.",
    why: "A simple weekly target that builds the habit.",
    how: "Added up from the patient's diary entries.",
    preview: { kind: "bars", items: [{ label: "This week", value: 72, note: "108 of 150 min" }] },
  },
  condition_answers: {
    what: "The questions answered about the condition, which the patient can correct.",
    why: "The patient can see - and fix - what the clinic has on record.",
    how: "Answered at onboarding; the patient can request a correction.",
    preview: { kind: "list", items: ["Where is the pain? Left knee", "Since when? 3 months", "Worse on stairs? Yes"] },
  },
  who_writes_what: {
    what: "A short guide to who writes which part of the profile.",
    why: "Patients know what they can edit and what their physiotherapist owns.",
    how: "Fixed text - nothing to fill in.",
    preview: { kind: "text", text: "You: Pain Map, diary, reports. Your physiotherapist: goals, measures, exercises." },
  },
  reports_scans: {
    what: "X-rays, scans and test results the patient uploaded.",
    why: "Everything in one place, read before each session.",
    how: "The patient uploads them from their dashboard.",
    preview: { kind: "list", items: ["Knee X-ray - 2 Oct", "MRI report - 18 Sep"] },
  },
  care_plan_history: {
    what: "Every recommendation the physiotherapist made, with its history.",
    why: "The patient sees what was suggested and what they chose.",
    how: `${T} writes recommendations after sessions.`,
    preview: { kind: "list", items: ["6-session knee programme - accepted 20 Oct", "Home visit - declined"] },
  },
};

/** The guide for any widget, graph lines included (built from the measure). */
export function widgetGuide(widget: Pick<ProfileWidget, "key" | "group">): WidgetGuide | null {
  if (widget.group !== "graph_line") return SECTIONS[widget.key] ?? null;
  const key = widget.key.startsWith(GRAPH_LINE_PREFIX) ? widget.key.slice(GRAPH_LINE_PREFIX.length) : widget.key;
  const m = OUTCOME_MEASURES.find((x) => x.key === key);
  if (!m) return null;
  const up = m.better === "higher";
  const better =
    m.better === "higher"
      ? "higher is better"
      : m.better === "lower"
        ? "lower is better"
        : m.better === "toward_normal"
          ? "closer to the normal range is better"
          : m.better === "earlier"
            ? "earlier is better"
            : "holding steady is the aim";
  const span = m.max - m.min;
  const at = (f: number) => Math.round((m.min + span * f) * 10) / 10;
  // Kept in the lower half of the range, where real readings sit for most
  // measures (a symmetry index at 140% read as nonsense).
  const points = up ? [at(0.2), at(0.28), at(0.33), at(0.42), at(0.5)] : [at(0.5), at(0.42), at(0.36), at(0.28), at(0.2)];
  return {
    what: `${m.plainName} - the ${m.label} line on the progress graph.`,
    why: `It shows whether ${m.plainName.toLowerCase()} is improving over the course (${better}).`,
    how: `${T[0].toUpperCase()}${T.slice(1)} records it at a review; each review adds a dot.`,
    preview: { kind: "line", label: m.plainName, unit: !m.unit ? "" : m.unit === "%" || m.unit.startsWith("/") ? m.unit : ` ${m.unit}`, points, min: m.min, max: m.max, better: up ? "up" : "down" },
  };
}

/** Every widget key that has no guide (the test keeps this empty). */
export function widgetsWithoutGuide(): string[] {
  return PROFILE_WIDGETS.filter((w) => !widgetGuide(w)).map((w) => w.key);
}
