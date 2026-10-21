// What the paediatric Health Profile draws, worked out in one tested place so
// the parent's page, the therapist's chart and the admin's chart cannot each
// grow their own idea of "milestones so far" or "the headline tile" (the
// neurological page's neuroProfile.ts, for the other condition type).
// Dependency-free of React and Supabase; nothing here reads a clock.
//
// Two stores feed one graph, and each measure has exactly one owner:
//   - the paediatric examination (peds_assessments) owns the WHO milestones
//     and GMFCS. The graph's "milestones achieved" line is the count of the
//     six recorded as achieved as at each examination; a skill already
//     achieved stays counted when a later examination did not look at it
//     ("not assessed" is not "lost it"), and a later examination that finds
//     it not there wins.
//   - outcome_measurements owns standing time and independent steps (three
//     tries, the best kept). Nothing is drawn from both.

import {
  changeDirection,
  OUTCOME_MEASURES,
  outcomeMeasure,
  type ProfileKind,
} from "@/lib/outcomeMeasures";
import {
  seriesKeyFor,
  type MeasureSeries,
  type MilestoneTarget,
  type SeriesPoint,
} from "@/lib/outcomeSeries";
import {
  PEDS_MILESTONE_KEYS,
  type ParsedPedsAssessment,
  type PedsMilestoneStatus,
} from "@/lib/pedsExam";
import { parseMultiSelect } from "@/lib/conditionIntake";
import { sparklinePath } from "@/lib/progressChart";
import {
  keyTile,
  readingText,
  type KeyTile,
  type Voice,
} from "@/lib/progressView";
import { formatClinicDateShort } from "@/lib/formatDateTime";
import type { StatusInput } from "@/lib/profileStatus";

export const PEDS_PROFILE_KIND: ProfileKind = "pediatrics";
export const PEDS_MILESTONES_MEASURE = "peds_milestones_achieved";
export const PEDS_STEPS_MEASURE = "peds_independent_steps";
export const PEDS_STANDING_MEASURE = "peds_standing_seconds";

const REGISTRY_ORDER = new Map(OUTCOME_MEASURES.map((m, i) => [m.key, i]));

/** Measure keys whose line comes from the examination, not from the recorded
 *  measurements. */
export function pedsExamOwnedKeys(): string[] {
  return [PEDS_MILESTONES_MEASURE];
}

// --- Milestones achieved over time ---------------------------------------------

export type MilestoneCount = {
  examId: string;
  at: string;
  achieved: number;
  byRole: string;
};

/**
 * Achieved milestones as at each examination that assessed at least one,
 * oldest first. An examination that looked at a subset leaves the others as
 * the examination before had them (never a drop to "not yet" from silence).
 */
export function milestoneCounts(
  exams: readonly ParsedPedsAssessment[],
): MilestoneCount[] {
  const oldestFirst = [...exams].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  const state = new Map<string, PedsMilestoneStatus>();
  const out: MilestoneCount[] = [];
  for (const exam of oldestFirst) {
    const assessed = PEDS_MILESTONE_KEYS.filter(
      (k) => exam.findings.milestones[k],
    );
    if (assessed.length === 0) continue;
    for (const k of assessed) state.set(k, exam.findings.milestones[k]!.status);
    out.push({
      examId: exam.id,
      at: exam.createdAt,
      achieved: [...state.values()].filter((s) => s === "achieved").length,
      byRole: exam.submittedByRole,
    });
  }
  return out;
}

export function milestoneSeries(
  exams: readonly ParsedPedsAssessment[],
): MeasureSeries | null {
  const counts = milestoneCounts(exams);
  const m = outcomeMeasure(PEDS_MILESTONES_MEASURE);
  if (counts.length === 0 || !m) return null;
  const points: SeriesPoint[] = counts.map((c) => ({
    measurementId: `peds-exam:${c.examId}:milestones`,
    value: c.achieved,
    measuredAt: c.at,
    reviewKey: `peds-exam:${c.examId}`,
    appointmentId: null,
    setting: null,
    recordedBy: c.byRole,
    testerName: null,
    readingsInReview: 1,
  }));
  return {
    key: seriesKeyFor({ measureKey: m.key, variant: null, side: null }),
    measureKey: m.key,
    variant: null,
    side: null,
    medicationState: null,
    joinPoints: true,
    known: true,
    label: m.label,
    plainName: m.plainName,
    variantLabel: null,
    unit: m.unit,
    decimals: m.decimals,
    better: m.better,
    points,
  };
}

/** Every line the paediatric page draws, in registry order: the recorded
 *  measurements (minus any the examination owns) plus the milestone line. */
export function pedsSeries(input: {
  recorded: readonly MeasureSeries[];
  exams: readonly ParsedPedsAssessment[];
}): MeasureSeries[] {
  const owned = new Set(pedsExamOwnedKeys());
  const kept = input.recorded.filter((s) => !owned.has(s.measureKey));
  const line = milestoneSeries(input.exams);
  return [...kept, ...(line ? [line] : [])].sort(
    (a, b) =>
      (REGISTRY_ORDER.get(a.measureKey) ?? Number.MAX_SAFE_INTEGER) -
        (REGISTRY_ORDER.get(b.measureKey) ?? Number.MAX_SAFE_INTEGER) ||
      a.measureKey.localeCompare(b.measureKey),
  );
}

/** The newest review on the record: a recorded measurement or an examination. */
export function pedsLastReviewAt(
  series: readonly MeasureSeries[],
  exams: readonly ParsedPedsAssessment[],
): string | null {
  let best: string | null = null;
  const consider = (iso: string) => {
    if (best === null || Date.parse(iso) > Date.parse(best)) best = iso;
  };
  for (const s of series) for (const p of s.points) consider(p.measuredAt);
  for (const e of exams) consider(e.createdAt);
  return best;
}

// --- The status rule -------------------------------------------------------------

const MAIN_PREFERENCE = [
  PEDS_STEPS_MEASURE,
  PEDS_STANDING_MEASURE,
  PEDS_MILESTONES_MEASURE,
] as const;

/**
 * What the status rule reads: the first of independent steps, standing time
 * and milestones achieved that can be compared (two reviews), else the first
 * with any reading. A child's record has no falls or red-flag signal here.
 */
export function pedsStatusInput(series: readonly MeasureSeries[]): StatusInput {
  const lines = MAIN_PREFERENCE.map((k) =>
    series.find((s) => s.measureKey === k && s.points.length > 0),
  ).filter((s): s is MeasureSeries => !!s && s.joinPoints && s.known);
  const main = lines.find((s) => s.points.length >= 2) ?? lines[0] ?? null;
  if (!main) return { main: null };
  const tester = (p: SeriesPoint) => p.testerName ?? p.recordedBy;
  return {
    main: {
      measureKey: main.measureKey,
      values: main.points.map((p) => p.value),
      profileKind: PEDS_PROFILE_KIND,
      differentTester:
        tester(main.points[0]) !== tester(main.points[main.points.length - 1]),
    },
  };
}

// --- The four key numbers --------------------------------------------------------

function placeholder(
  key: string,
  label: string,
  text: string,
  valueText = "Not yet",
): KeyTile {
  return {
    key,
    label,
    fullLabel: label,
    valueText,
    sparkPath: null,
    deltaText: text,
    deltaTone: "neutral",
    goalText: null,
  };
}

const COULDNT_LOAD = "We couldn't load this just now. It is not missing.";

function lineTile(
  s: MeasureSeries | undefined,
  key: string,
  label: string,
  milestones: readonly MilestoneTarget[],
  voice: Voice,
  all: readonly MeasureSeries[],
  unavailable: boolean,
): KeyTile {
  if (!s)
    return unavailable
      ? placeholder(key, label, COULDNT_LOAD, "Unavailable")
      : placeholder(key, label, "Not measured yet");
  const tile = keyTile(s, milestones, PEDS_PROFILE_KIND, voice, all);
  // "15 seconds" wrapped a tile's value onto two lines on a phone.
  return {
    ...tile,
    label,
    valueText: tile.valueText.replace(/ seconds$/, " s"),
  };
}

/** The intake's tick list as a count: how many of the listed everyday skills
 *  the parent ticked. */
export function intakeChecklist(
  options: readonly string[],
  answer: string | undefined | null,
): { label: string; done: boolean }[] {
  const ticked = new Set(parseMultiSelect(answer));
  return options.map((label) => ({ label, done: ticked.has(label) }));
}

function milestonesTile(input: {
  exams: readonly ParsedPedsAssessment[];
  series: readonly MeasureSeries[];
  voice: Voice;
  examsFailed: boolean;
  checklist: readonly { label: string; done: boolean }[];
}): KeyTile {
  const patient = input.voice === "patient";
  const label = patient ? "Milestones reached" : "Milestones achieved";
  const line = input.series.find(
    (s) => s.measureKey === PEDS_MILESTONES_MEASURE,
  );
  if (line) {
    const now = line.points[line.points.length - 1];
    const first = line.points[0];
    const moved = now.value - first.value;
    return {
      key: "milestones",
      label,
      fullLabel: "Movement milestones (WHO) recorded as achieved, of six",
      valueText: `${now.value} of 6`,
      sparkPath: sparklinePath(line.points.map((p) => p.value)),
      deltaText:
        line.points.length < 2
          ? patient
            ? "At the first examination"
            : "First examination"
          : moved === 0
            ? "Same as the first examination"
            : `${moved > 0 ? "Up" : "Down"} ${Math.abs(moved)} since the first examination`,
      deltaTone:
        line.points.length < 2 || moved === 0
          ? "neutral"
          : moved > 0
            ? "good"
            : "bad",
      goalText: null,
    };
  }
  if (input.examsFailed)
    return placeholder("milestones", label, COULDNT_LOAD, "Unavailable");
  if (input.checklist.length > 0) {
    const done = input.checklist.filter((c) => c.done).length;
    return {
      key: "milestones",
      label: patient
        ? "Things they do on their own"
        : "Skills ticked at intake",
      fullLabel: "Everyday skills ticked on the intake, as the parent answered",
      valueText: `${done} of ${input.checklist.length}`,
      sparkPath: null,
      deltaText: patient
        ? "As you told us"
        : "Parent's report; no milestones examined yet",
      deltaTone: "neutral",
      goalText: null,
    };
  }
  return placeholder(
    "milestones",
    label,
    patient ? "Not checked yet" : "Not examined yet",
  );
}

export type PedsSessions = { done: number; next: string | null };

function sessionsTile(sessions: PedsSessions | null): KeyTile {
  if (!sessions)
    return placeholder("sessions", "Sessions", COULDNT_LOAD, "Unavailable");
  return {
    key: "sessions",
    label: "Sessions",
    fullLabel: "Sessions completed",
    valueText: String(sessions.done),
    sparkPath: null,
    deltaText:
      sessions.done === 0
        ? "None finished yet"
        : sessions.done === 1
          ? "1 session finished"
          : `${sessions.done} sessions finished`,
    deltaTone: "neutral",
    goalText: sessions.next
      ? `Next: ${formatClinicDateShort(sessions.next)}`
      : "None booked",
  };
}

/**
 * Four tiles, always four, in this order: milestones achieved (of the six
 * the examination records; before one exists, of the intake's tick list),
 * independent steps, independent standing time, sessions. A tile with no
 * data says "Not yet", and one whose source could not be read says
 * "Unavailable" -- never "Not yet", which would read as nothing recorded.
 */
export function pedsKeyTiles(input: {
  series: readonly MeasureSeries[];
  exams: readonly ParsedPedsAssessment[];
  examsFailed: boolean;
  measuresFailed: boolean;
  milestones: readonly MilestoneTarget[];
  voice: Voice;
  checklist: readonly { label: string; done: boolean }[];
  sessions: PedsSessions | null;
}): KeyTile[] {
  const { series, voice, milestones } = input;
  const patient = voice === "patient";
  const line = (key: string) =>
    series.find((s) => s.measureKey === key && s.points.length > 0);
  return [
    milestonesTile({
      exams: input.exams,
      series,
      voice,
      examsFailed: input.examsFailed,
      checklist: input.checklist,
    }),
    lineTile(
      line(PEDS_STEPS_MEASURE),
      PEDS_STEPS_MEASURE,
      patient ? "Steps on their own" : "Independent steps",
      milestones,
      voice,
      series,
      input.measuresFailed,
    ),
    lineTile(
      line(PEDS_STANDING_MEASURE),
      PEDS_STANDING_MEASURE,
      patient ? "Standing on their own" : "Independent standing",
      milestones,
      voice,
      series,
      input.measuresFailed,
    ),
    sessionsTile(input.sessions),
  ];
}

// --- Words -----------------------------------------------------------------------

function lineMove(s: MeasureSeries): "better" | "worse" | "flat" {
  const first = s.points[0].value;
  const now = s.points[s.points.length - 1].value;
  if (first === now || !s.joinPoints) return "flat";
  const dir = changeDirection(s.measureKey, first, now, {
    profileKind: PEDS_PROFILE_KIND,
  });
  return dir === "better" ? "better" : dir === "worse" ? "worse" : "flat";
}

/**
 * A few plain sentences built from the numbers alone, for when nobody has
 * written a summary: the draft the writing box starts from and, labelled as
 * generated, the card's fallback. Never a judgement, and in the parent's
 * voice never anything about a window or a referral. Null when there is
 * nothing to say.
 */
export function pedsStandSummary(input: {
  series: readonly MeasureSeries[];
  voice: Voice;
}): string | null {
  const parent = input.voice === "patient";
  const sentences: string[] = [];
  const line = (key: string) =>
    input.series.find((s) => s.measureKey === key && s.points.length > 0);

  const milestones = line(PEDS_MILESTONES_MEASURE);
  if (milestones) {
    const now = milestones.points[milestones.points.length - 1].value;
    sentences.push(
      parent
        ? `${now} of the 6 movement milestones we follow ${now === 1 ? "is" : "are"} ticked off.`
        : `${now} of 6 WHO motor milestones recorded as achieved at the latest examination.`,
    );
  }
  const describe = (s: MeasureSeries, label: string, unit: string) => {
    const now = s.points[s.points.length - 1].value;
    const nowText = readingText(now, s.decimals, unit);
    if (s.points.length < 2 || !s.joinPoints)
      return `${label} was ${nowText} at the latest review.`;
    const was = readingText(s.points[0].value, s.decimals, unit);
    const dir = lineMove(s);
    return dir === "better"
      ? `${label} has gone from ${was} to ${nowText}.`
      : dir === "worse"
        ? `${label} has gone from ${was} to ${nowText}.`
        : `${label} is about where it was, ${nowText}.`;
  };
  const steps = line(PEDS_STEPS_MEASURE);
  if (steps)
    sentences.push(
      describe(
        steps,
        parent ? "Steps without holding on" : "Independent steps",
        "steps",
      ),
    );
  const standing = line(PEDS_STANDING_MEASURE);
  if (standing)
    sentences.push(
      describe(
        standing,
        parent ? "Standing without holding on" : "Independent standing time",
        "seconds",
      ),
    );
  return sentences.length > 0 ? sentences.join(" ") : null;
}

/** The line under the child's name: the main concern as the parent wrote it,
 *  trimmed to its first line. Null when not answered. */
export function pedsConditionLine(
  data: Readonly<Record<string, unknown>>,
): string | null {
  const raw = data.peds_concern;
  const text = (typeof raw === "string" ? raw : "").split("\n")[0].trim();
  return text || null;
}

// --- Equipment chips ---------------------------------------------------------------

const NO_EQUIPMENT = /^(none|no|nil|n\/a|na|not applicable|nothing|-)\.?$/i;
const CHIP_MAX = 48;

/**
 * The header's equipment chips: what the latest examination records (the
 * current word on braces and splints - children outgrow them) else what the
 * parent wrote on the intake. Split on semicolons and line breaks only (a
 * comma is usually part of one description: "ankle splints, fitted last
 * year"), at most three, each cut to a chip's length. "None" is no chip.
 */
export function pedsEquipmentChips(
  intakeText: string | null | undefined,
  examText: string | null | undefined,
): string[] {
  const source = (examText ?? "").trim() || (intakeText ?? "").trim();
  if (!source || NO_EQUIPMENT.test(source)) return [];
  return source
    .split(/[;\n]+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p && !NO_EQUIPMENT.test(p))
    .slice(0, 3)
    .map((p) =>
      p.length > CHIP_MAX ? `${p.slice(0, CHIP_MAX - 1).trimEnd()}…` : p,
    );
}
