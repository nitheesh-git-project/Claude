import { OUTCOME_MEASURES, PROFILE_KINDS, type ProfileKind } from "@/lib/outcomeMeasures";

// What the Health Profile shows, decided by the clinic (the owner's
// requirement: "admin should have control of the entire health profile --
// what is shown and what is not, specific to the condition and also specific
// to the patient").
//
// Every section of the profile is a "widget" in this registry, per profile
// kind. Which ones a patient's page draws is resolved here, purely:
//
//   the patient's own override  >  the condition kind's setting  >  the
//   registry default
//
// with four rules on top:
//  1. A `locked` widget is always shown. Locked is anything a person could be
//     hurt by not seeing: the status with its red flags and "needs attention",
//     home exercises and their safety lines, the fall-risk level and standing
//     blood pressure (Strength and balance care), the heart and lung safety
//     box and the surgeon's precautions. The tables' CHECK repeats the list
//     (supabase/schema.sql), so no caller can store a hidden locked widget.
//  2. A key the registry does not know, or one that does not apply to this
//     kind, is ignored: a stale row never hides anything.
//  3. A layer that could not be read is skipped, never read as "everything
//     off": the profile falls back to the next layer (in the end, the
//     defaults) and the admin screen -- only the admin screen -- says "we
//     couldn't check".
//  4. Hidden is a patient-page decision. The therapist sees the same set with
//     the hidden ones behind a "N sections hidden for this patient" disclosure,
//     and the admin sees everything with the hidden ones marked, so no
//     clinician is ever blind to a reading.
//
// The page decides what renders (the server never sends a hidden section's
// data to the patient's screen); this module only answers the question.
// Dependency-free apart from the measure registry, and tested without a
// database.

export type WidgetGroup = "core" | "picture" | "records" | "graph_line";

export type ProfileWidget = {
  key: string;
  /** What the admin screen calls it. */
  label: string;
  /** One line: what this section is, in a clinic owner's words. */
  description: string;
  kinds: readonly ProfileKind[];
  defaultVisible: boolean;
  locked: boolean;
  /** Why it can never be hidden, said beside the lock. */
  lockedReason?: string;
  group: WidgetGroup;
  /** A graph line belongs to the progress graph: hiding the graph hides it. */
  parent?: string;
};

const ALL: readonly ProfileKind[] = PROFILE_KINDS;
const FALLS_DIARY: readonly ProfileKind[] = ["neuro", "neuro_parkinsons", "geriatric"];

/** The locked keys, in one list the schema's CHECK mirrors. */
export const LOCKED_WIDGET_KEYS = ["status_header", "home_exercises", "fall_risk", "orthostatic", "cardio_safety", "precautions"] as const;

const SECTIONS: readonly ProfileWidget[] = [
  {
    key: "status_header",
    label: "Status and where things stand",
    description: "The name, the status pill, the phase and the physiotherapist's summary at the top.",
    kinds: ALL,
    defaultVisible: true,
    locked: true,
    lockedReason: "It carries the status, red flags and anything that needs attention.",
    group: "core",
  },
  {
    key: "home_exercises",
    label: "Home exercises",
    description: "The exercises to do at home, with how often and what to watch for.",
    kinds: ALL,
    defaultVisible: true,
    locked: true,
    lockedReason: "It carries the safety lines for exercising at home.",
    group: "core",
  },
  {
    key: "fall_risk",
    label: "Fall-risk level",
    description: "The fall-risk level and the rule that decided it.",
    kinds: ["geriatric"],
    defaultVisible: true,
    locked: true,
    lockedReason: "A fall-risk result is a safety finding.",
    group: "picture",
  },
  {
    key: "orthostatic",
    label: "Standing blood pressure",
    description: "Whether blood pressure drops on standing up.",
    kinds: ["geriatric"],
    defaultVisible: true,
    locked: true,
    lockedReason: "A drop on standing is a falls safety flag.",
    group: "picture",
  },
  {
    key: "cardio_safety",
    label: "Safety limits and when to stop",
    description: "The patient's own exercise limits, any flagged reading, and the stop-and-tell box.",
    kinds: ["cardiopulmonary"],
    defaultVisible: true,
    locked: true,
    lockedReason: "These are the pre-exercise safety checks.",
    group: "picture",
  },
  {
    key: "precautions",
    label: "Surgeon's precautions",
    description: "What not to do yet after an operation, and until when.",
    kinds: ["cardiopulmonary"],
    defaultVisible: true,
    locked: true,
    lockedReason: "Precautions keep a healing operation safe.",
    group: "picture",
  },
  {
    key: "key_numbers",
    label: "Four key numbers",
    description: "The four tiles with the latest figure for each headline measure.",
    kinds: ALL,
    defaultVisible: true,
    locked: false,
    group: "core",
  },
  {
    key: "progress_graph",
    label: "Progress graph",
    description: "\"Are you getting better?\" - one dot per review against the goal band.",
    kinds: ALL,
    defaultVisible: true,
    locked: false,
    group: "core",
  },
  {
    key: "steps",
    label: "Goal and steps",
    description: "The goal the physiotherapist set and the steps towards it.",
    kinds: ALL,
    defaultVisible: true,
    locked: false,
    group: "core",
  },
  {
    key: "measures_table",
    label: "Measures table",
    description: "First reading, latest reading and goal for every measure.",
    kinds: ALL,
    defaultVisible: true,
    locked: false,
    group: "core",
  },
  {
    key: "body_map",
    label: "Body map and area by area",
    description: "The body map with each painful area, the knee-bend and strength visuals.",
    kinds: ["ortho"],
    defaultVisible: true,
    locked: false,
    group: "picture",
  },
  {
    key: "exam_picture",
    label: "Examination picture",
    description: "The neurological examination, the affected side and the walking ladder.",
    kinds: ["neuro", "neuro_parkinsons"],
    defaultVisible: true,
    locked: false,
    group: "picture",
  },
  {
    key: "parkinsons_symptoms",
    label: "Symptom profile and stage",
    description: "Which Parkinson's symptoms lead, and the stage.",
    kinds: ["neuro_parkinsons"],
    defaultVisible: true,
    locked: false,
    group: "picture",
  },
  {
    key: "milestone_chart",
    label: "Milestone chart",
    description: "The milestone windows chart and the list of what the child does on their own.",
    kinds: ["pediatrics"],
    defaultVisible: true,
    locked: false,
    group: "picture",
  },
  {
    key: "steadi_tests",
    label: "Balance and strength test cards",
    description: "The four short tests of balance, strength and walking.",
    kinds: ["geriatric"],
    defaultVisible: true,
    locked: false,
    group: "picture",
  },
  {
    key: "daily_living",
    label: "Daily living",
    description: "How much of washing, dressing and moving about is managed alone.",
    kinds: ["geriatric"],
    defaultVisible: true,
    locked: false,
    group: "picture",
  },
  {
    key: "home_safety",
    label: "Home safety check",
    description: "The checklist of hazards at home.",
    kinds: ["geriatric"],
    defaultVisible: true,
    locked: false,
    group: "picture",
  },
  {
    key: "walk_track",
    label: "Six-minute walk",
    description: "How far the patient walked in six minutes, against what is expected.",
    kinds: ["cardiopulmonary"],
    defaultVisible: true,
    locked: false,
    group: "picture",
  },
  {
    key: "oxygen",
    label: "Oxygen",
    description: "Oxygen level at the latest reviews, against the patient's own limit.",
    kinds: ["cardiopulmonary"],
    defaultVisible: true,
    locked: false,
    group: "picture",
  },
  {
    key: "effort",
    label: "How hard to work",
    description: "The effort and heart-rate range to exercise in.",
    kinds: ["cardiopulmonary"],
    defaultVisible: true,
    locked: false,
    group: "picture",
  },
  {
    key: "vitals",
    label: "Vitals",
    description: "Heart rate and blood pressure at the latest reviews.",
    kinds: ["cardiopulmonary"],
    defaultVisible: true,
    locked: false,
    group: "picture",
  },
  {
    key: "breathlessness",
    label: "Breathlessness grade",
    description: "How breathless everyday activity makes the patient.",
    kinds: ["cardiopulmonary"],
    defaultVisible: true,
    locked: false,
    group: "picture",
  },
  {
    key: "diary",
    label: "Diary",
    description: "Falls and near misses the patient wrote down, and the list of entries.",
    kinds: FALLS_DIARY,
    defaultVisible: true,
    locked: false,
    group: "records",
  },
  {
    key: "freezing_chart",
    label: "Freezing by week",
    description: "Twelve weeks of feet getting stuck, from the diary.",
    kinds: ["neuro_parkinsons"],
    defaultVisible: true,
    locked: false,
    group: "records",
  },
  {
    key: "active_minutes",
    label: "Active minutes",
    description: "Active minutes a week from the diary, against the 150-minute aim.",
    kinds: ["cardiopulmonary"],
    defaultVisible: true,
    locked: false,
    group: "records",
  },
  {
    key: "condition_answers",
    label: "Answers about the condition",
    description: "The questions answered about the condition, which the patient can correct.",
    kinds: ALL,
    defaultVisible: true,
    locked: false,
    group: "records",
  },
  {
    key: "who_writes_what",
    label: "How this profile is filled in",
    description: "The short guide to who writes which part of the profile.",
    kinds: ALL,
    defaultVisible: true,
    locked: false,
    group: "records",
  },
  {
    key: "reports_scans",
    label: "Reports and scans",
    description: "X-rays, scans and test results the patient uploaded.",
    kinds: ALL,
    defaultVisible: true,
    locked: false,
    group: "records",
  },
  {
    key: "care_plan_history",
    label: "Past recommendations",
    description: "Every recommendation the physiotherapist made, with its history.",
    kinds: ALL,
    defaultVisible: true,
    locked: false,
    group: "records",
  },
];

/** The lines the geriatric and cardiopulmonary graphs draw (their Top
 *  components' GRAPH_KEYS); the other kinds draw every non-classification
 *  measure of the kind. */
export const GRAPH_LINE_KEYS_BY_KIND: Partial<Record<ProfileKind, readonly string[]>> = {
  geriatric: ["gait_speed_4m", "tug", "chair_stand_30s"],
  cardiopulmonary: ["six_minute_walk", "breathlessness_nrs", "resting_heart_rate"],
};

export const GRAPH_LINE_PREFIX = "graph:";

export function graphLineWidgetKey(measureKey: string): string {
  return `${GRAPH_LINE_PREFIX}${measureKey}`;
}

function graphLines(): ProfileWidget[] {
  const out: ProfileWidget[] = [];
  for (const m of OUTCOME_MEASURES) {
    if (m.classification) continue;
    const kinds = m.profileKinds.filter((k) => {
      const only = GRAPH_LINE_KEYS_BY_KIND[k];
      return !only || only.includes(m.key);
    });
    if (kinds.length === 0) continue;
    out.push({
      key: graphLineWidgetKey(m.key),
      label: m.label,
      description: `The ${m.label} line on the progress graph.`,
      kinds,
      defaultVisible: true,
      locked: false,
      group: "graph_line",
      parent: "progress_graph",
    });
  }
  return out;
}

/** Every widget, every kind. */
export const PROFILE_WIDGETS: readonly ProfileWidget[] = [...SECTIONS, ...graphLines()];

const BY_KEY = new Map(PROFILE_WIDGETS.map((w) => [w.key, w]));

export function profileWidget(key: string): ProfileWidget | null {
  return BY_KEY.get(key) ?? null;
}

/** The widgets one profile kind has, in the registry's order. */
export function widgetsForKind(kind: ProfileKind): ProfileWidget[] {
  return PROFILE_WIDGETS.filter((w) => w.kinds.includes(kind));
}

export function isProfileKind(value: unknown): value is ProfileKind {
  return typeof value === "string" && (PROFILE_KINDS as readonly string[]).includes(value);
}

/** Whether `key` names a widget this kind has (what a route accepts). */
export function isWidgetOfKind(key: unknown, kind: ProfileKind): key is string {
  if (typeof key !== "string") return false;
  const w = BY_KEY.get(key);
  return !!w && w.kinds.includes(kind);
}

// --- Resolution --------------------------------------------------------------------------

export type WidgetChoice = { widgetKey: string; visible: boolean };

/** A layer of choices as it was read: the rows, or "we couldn't check". */
export type WidgetChoicesRead = { status: "ok"; choices: readonly WidgetChoice[] } | { status: "unreadable" };

export type WidgetSource = "locked" | "patient" | "kind" | "default";

export type ResolvedWidget = {
  widget: ProfileWidget;
  visible: boolean;
  /** Which layer decided it. */
  source: WidgetSource;
  /** What the condition kind alone would say (the "inherited" value the
   *  per-patient panel shows beside an override). */
  inherited: boolean;
};

export type ResolvedLayout = {
  kind: ProfileKind;
  widgets: ResolvedWidget[];
  /** Keys of the widgets shown on the patient's page. */
  shown: ReadonlySet<string>;
  /** The sections (not graph lines) hidden from the patient's page. */
  hiddenSections: ResolvedWidget[];
  /** The graph lines hidden from the patient's page. */
  hiddenGraphLines: ResolvedWidget[];
  /** Sections only (graph lines are counted apart). */
  sectionsShown: number;
  sectionsTotal: number;
  kindUnreadable: boolean;
  patientUnreadable: boolean;
};

function choiceMap(read: WidgetChoicesRead | null | undefined, kind: ProfileKind): Map<string, boolean> {
  const map = new Map<string, boolean>();
  if (!read || read.status !== "ok") return map;
  for (const c of read.choices) {
    if (typeof c.visible !== "boolean" || !isWidgetOfKind(c.widgetKey, kind)) continue;
    map.set(c.widgetKey, c.visible);
  }
  return map;
}

/**
 * The patient's layout: the patient override beats the condition kind's
 * setting, which beats the registry default; locked is always shown; a graph
 * line under a hidden graph is hidden with it; unknown keys are ignored; an
 * unreadable layer is skipped.
 */
export function resolveProfileWidgets(input: {
  kind: ProfileKind;
  kindChoices?: WidgetChoicesRead | null;
  patientChoices?: WidgetChoicesRead | null;
}): ResolvedLayout {
  const { kind } = input;
  const byKind = choiceMap(input.kindChoices, kind);
  const byPatient = choiceMap(input.patientChoices, kind);
  const first: ResolvedWidget[] = widgetsForKind(kind).map((widget) => {
    const inherited = widget.locked ? true : (byKind.get(widget.key) ?? widget.defaultVisible);
    if (widget.locked) return { widget, visible: true, source: "locked", inherited };
    if (byPatient.has(widget.key)) return { widget, visible: byPatient.get(widget.key)!, source: "patient", inherited };
    if (byKind.has(widget.key)) return { widget, visible: byKind.get(widget.key)!, source: "kind", inherited };
    return { widget, visible: widget.defaultVisible, source: "default", inherited };
  });
  const visibleByKey = new Map(first.map((r) => [r.widget.key, r.visible]));
  const widgets = first.map((r) =>
    r.widget.parent && visibleByKey.get(r.widget.parent) === false ? { ...r, visible: false } : r
  );
  const shown = new Set(widgets.filter((r) => r.visible).map((r) => r.widget.key));
  const sections = widgets.filter((r) => r.widget.group !== "graph_line");
  return {
    kind,
    widgets,
    shown,
    hiddenSections: sections.filter((r) => !r.visible),
    hiddenGraphLines: widgets.filter((r) => r.widget.group === "graph_line" && !r.visible),
    sectionsShown: sections.filter((r) => r.visible).length,
    sectionsTotal: sections.length,
    kindUnreadable: input.kindChoices?.status === "unreadable",
    patientUnreadable: input.patientChoices?.status === "unreadable",
  };
}

/** Whether the patient's page draws `key`. A key the layout does not know is
 *  drawn: an unknown key never hides anything. */
export function widgetShown(layout: Pick<ResolvedLayout, "shown" | "widgets"> | null | undefined, key: string): boolean {
  if (!layout) return true;
  if (layout.shown.has(key)) return true;
  return !layout.widgets.some((r) => r.widget.key === key);
}

/** The graph lines a viewer's graph draws: for the patient, the ones shown;
 *  for a clinician, every line (the hidden ones are noted, never removed). */
export function filterGraphLines<T extends { measureKey: string }>(
  series: readonly T[],
  layout: Pick<ResolvedLayout, "shown" | "widgets"> | null | undefined
): T[] {
  return series.filter((s) => widgetShown(layout, graphLineWidgetKey(s.measureKey)));
}

/** "12 of 15 sections shown". */
export function sectionsShownText(layout: Pick<ResolvedLayout, "sectionsShown" | "sectionsTotal">): string {
  return `${layout.sectionsShown} of ${layout.sectionsTotal} sections shown`;
}

/** The therapist's disclosure line: "2 sections hidden for this patient". */
export function hiddenForPatientText(count: number): string {
  return `${count} ${count === 1 ? "section" : "sections"} hidden for this patient`;
}

/** The plain profile-kind words for the admin screen. */
export const PROFILE_WIDGET_KIND_ORDER: readonly ProfileKind[] = PROFILE_KINDS;

/** The reason an override is saved with, checked the way the table checks it. */
export const OVERRIDE_REASON_MAX = 200;

export function cleanOverrideReason(raw: unknown): { ok: true; reason: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, reason: null };
  if (typeof raw !== "string") return { ok: false, error: "The reason must be text." };
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length > OVERRIDE_REASON_MAX) return { ok: false, error: `Keep the reason to ${OVERRIDE_REASON_MAX} characters or fewer.` };
  return { ok: true, reason: text || null };
}

/** The body of the two admin routes, checked against the registry: a key
 *  this kind does not have, or hiding a locked one, is a 400 with a sentence. */
export function validateWidgetChoice(
  body: Record<string, unknown>,
  kind: ProfileKind
): { ok: true; widget: ProfileWidget; visible: boolean | null } | { ok: false; error: string; code: "unknown_widget" | "locked_widget" | "bad_value" } {
  const key = body.widgetKey;
  if (!isWidgetOfKind(key, kind)) {
    return { ok: false, error: "That section is not part of this kind of Health Profile.", code: "unknown_widget" };
  }
  const widget = BY_KEY.get(key)!;
  const raw = body.visible;
  // null = reset to the next layer down (the condition default, or the code's).
  if (raw !== null && typeof raw !== "boolean") return { ok: false, error: "Say whether the section is shown.", code: "bad_value" };
  if (widget.locked && raw !== null) {
    return { ok: false, error: `${widget.label} is always shown: ${widget.lockedReason ?? "it is a safety section."}`, code: "locked_widget" };
  }
  return { ok: true, widget, visible: raw };
}

/** The resolved layout as plain rows for a screen (no Set, no functions). */
export function widgetRows(layout: Pick<ResolvedLayout, "widgets">): {
  key: string;
  label: string;
  description: string;
  group: WidgetGroup;
  parent: string | null;
  locked: boolean;
  lockedReason: string | null;
  visible: boolean;
  inherited: boolean;
  source: WidgetSource;
}[] {
  return layout.widgets.map((r) => ({
    key: r.widget.key,
    label: r.widget.label,
    description: r.widget.description,
    group: r.widget.group,
    parent: r.widget.parent ?? null,
    locked: r.widget.locked,
    lockedReason: r.widget.lockedReason ?? null,
    visible: r.visible,
    inherited: r.inherited,
    source: r.source,
  }));
}
