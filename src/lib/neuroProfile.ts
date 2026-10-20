import {
  gaitSpeedBand,
  gaitSpeedFromTenMetre,
  GAIT_SPEED_LABEL,
  type GaitSpeedBand,
  type NeuroFindings,
  type ParsedNeuroAssessment,
} from "@/lib/neuroExam";
import {
  changeDirection,
  measurementSource,
  OUTCOME_MEASURES,
  outcomeMeasure,
  type ProfileKind,
} from "@/lib/outcomeMeasures";
import {
  seriesKeyFor,
  type MeasurementPoint,
  type MeasureSeries,
  type MilestoneTarget,
  type SeriesPoint,
} from "@/lib/outcomeSeries";
import {
  clinicWeekStart,
  diaryProvenance,
  FREEZING_TRIGGERS,
  freezingWeeklySeries,
  type DiaryEntry,
  type FallDetails,
  type FreezingDetails,
  type FreezingTrigger,
} from "@/lib/patientDiary";
import { sparklinePath } from "@/lib/progressChart";
import { keyTile, readingText, type KeyTile, type Voice } from "@/lib/progressView";
import type { StatusInput } from "@/lib/profileStatus";
import type { IntakeTrendPoint } from "@/lib/healthProfileSummary";
import { formatClinicDateShort } from "@/lib/formatDateTime";

// What the neurological and Parkinson's Health Profile draws, worked out in
// one tested place so the patient's page, the therapist's chart and the
// admin's chart cannot each grow their own idea of "the balance line" or
// "a new fall". Dependency-free of React and Supabase; nothing here reads a
// clock (the caller passes `nowMs`).
//
// Two stores feed one graph, and the registry says which owns what
// (outcomeMeasures.measurementSource): the neurological examination
// (neuro_assessments) owns Berg, the 10-metre walk and Timed Up and Go for a
// `neuro` record, so those lines are built from the exams and the recorded
// copy is dropped; on the Parkinson's sub-profile the exam does not own them
// (they are ON/OFF measurements in outcome_measurements) so no exam point is
// drawn for them. Nothing is ever drawn from both.

export type NeuroKind = Extract<ProfileKind, "neuro" | "neuro_parkinsons">;

export function isNeuroKind(kind: ProfileKind): kind is NeuroKind {
  return kind === "neuro" || kind === "neuro_parkinsons";
}

// --- The exam as lines ---------------------------------------------------------------------

const EXAM_FIELD: Record<string, (f: NeuroFindings) => number | undefined> = {
  berg_balance: (f) => f.balance.bergTotal,
  ten_metre_walk: (f) => (f.gait.tenMetreWalkSeconds === undefined ? undefined : gaitSpeedFromTenMetre(f.gait.tenMetreWalkSeconds)),
  tug: (f) => f.gait.tugSeconds,
};

/** The measures whose line comes from the neurological exam for this kind
 *  (registry `neuroExam.ownsFor`, or a `neuro_exam` source for a measure that
 *  applies to the kind at all). */
export function examOwnedKeys(kind: ProfileKind): string[] {
  return Object.keys(EXAM_FIELD).filter((key) => {
    const m = outcomeMeasure(key);
    return !!m && m.profileKinds.includes(kind) && measurementSource(key, kind) === "neuro_exam";
  });
}

/**
 * Berg, walking speed and Timed Up and Go as the exams stored them: each
 * exam is one point, in the registry's own units (the 10-metre walk is
 * stored in seconds and drawn as m/s, the unit its thresholds are in). An
 * exam that did not test a thing adds no point to its line - "not tested" is
 * never a zero.
 */
export function neuroExamSeries(exams: readonly ParsedNeuroAssessment[], kind: ProfileKind): MeasureSeries[] {
  const oldestFirst = [...exams].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const out: MeasureSeries[] = [];
  for (const key of examOwnedKeys(kind)) {
    const m = outcomeMeasure(key);
    const read = EXAM_FIELD[key];
    if (!m || !read) continue;
    const points: SeriesPoint[] = [];
    for (const exam of oldestFirst) {
      const value = read(exam.findings);
      if (value === undefined || !Number.isFinite(value)) continue;
      points.push({
        measurementId: `neuro-exam:${exam.id}:${key}`,
        value,
        measuredAt: exam.createdAt,
        reviewKey: `neuro-exam:${exam.id}`,
        appointmentId: null,
        setting: null,
        recordedBy: exam.submittedByRole,
        testerName: null,
        readingsInReview: 1,
      });
    }
    if (points.length === 0) continue;
    out.push({
      key: seriesKeyFor({ measureKey: key, variant: null, side: null }),
      measureKey: key,
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
    });
  }
  return out;
}

// --- The diary as a line -------------------------------------------------------------------

/** How many clinic weeks of the diary the graph and the card look back. */
export const DIARY_WEEKS = 12;

const midWeek = (weekStart: string) => `${weekStart}T06:30:00.000Z`;

/**
 * Freezing episodes per clinic week from the patient's diary, as points: one
 * per week somebody wrote in, **completed weeks only** (the week in progress
 * would read as an improvement before it is over). A week nobody wrote in is
 * not a point - "nothing written down" is not "no freezing".
 */
export function freezingDiaryPoints(entries: readonly DiaryEntry[], nowMs: number): SeriesPoint[] {
  const thisWeek = clinicWeekStart(nowMs);
  return freezingWeeklySeries(entries, { nowMs, weeks: DIARY_WEEKS })
    .filter((w) => w.written && w.weekStart < thisWeek)
    .map((w) => ({
      measurementId: `diary-week:${w.weekStart}`,
      value: w.episodes,
      measuredAt: midWeek(w.weekStart),
      reviewKey: `diary-week:${w.weekStart}`,
      appointmentId: null,
      setting: null,
      recordedBy: "patient",
      testerName: null,
      readingsInReview: 1,
    }));
}

/**
 * The one freezing line: the therapist's own weekly counts (`freezing_episodes`
 * in outcome_measurements) and the patient's diary weeks, **one point per
 * clinic week** - where both exist for a week the therapist's count stands
 * and the diary's is dropped, so a week is never counted twice. Null when
 * neither has a point.
 */
export function mergeFreezingLine(recorded: MeasureSeries | null, diaryPoints: readonly SeriesPoint[]): MeasureSeries | null {
  const m = outcomeMeasure("freezing_episodes");
  const base = recorded?.points ?? [];
  const taken = new Set(base.map((p) => clinicWeekStart(p.measuredAt)));
  const extra = diaryPoints.filter((p) => !taken.has(clinicWeekStart(p.measuredAt)));
  const points = [...base, ...extra].sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt));
  if (points.length === 0 || !m) return recorded;
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

// --- All the lines -------------------------------------------------------------------------

const REGISTRY_ORDER = new Map(OUTCOME_MEASURES.map((m, i) => [m.key, i]));
const SIDE_ORDER: Record<string, number> = { "": 0, left: 1, right: 2 };
const STATE_ORDER: Record<string, number> = { on: 0, off: 1, "": 2 };

/**
 * Every line the neurological page draws, in registry order: the recorded
 * measurements, minus any the exam owns for this kind, plus the exam's lines
 * and the freezing line (recorded counts and diary weeks merged). Each
 * measure has one source.
 */
export function neuroSeries(input: {
  recorded: readonly MeasureSeries[];
  exams: readonly ParsedNeuroAssessment[];
  kind: ProfileKind;
  diary: readonly DiaryEntry[] | null;
  nowMs: number;
}): MeasureSeries[] {
  const owned = new Set(examOwnedKeys(input.kind));
  const kept = input.recorded.filter((s) => !owned.has(s.measureKey) && s.measureKey !== "freezing_episodes");
  const recordedFreezing = input.recorded.find((s) => s.measureKey === "freezing_episodes") ?? null;
  const freezing =
    input.kind === "neuro_parkinsons"
      ? mergeFreezingLine(recordedFreezing, input.diary ? freezingDiaryPoints(input.diary, input.nowMs) : [])
      : recordedFreezing;
  const all = [...kept, ...neuroExamSeries(input.exams, input.kind), ...(freezing ? [freezing] : [])];
  return all.sort(
    (a, b) =>
      (REGISTRY_ORDER.get(a.measureKey) ?? Number.MAX_SAFE_INTEGER) - (REGISTRY_ORDER.get(b.measureKey) ?? Number.MAX_SAFE_INTEGER) ||
      a.measureKey.localeCompare(b.measureKey) ||
      (a.variant ?? "").localeCompare(b.variant ?? "") ||
      SIDE_ORDER[a.side ?? ""] - SIDE_ORDER[b.side ?? ""] ||
      STATE_ORDER[a.medicationState ?? ""] - STATE_ORDER[b.medicationState ?? ""]
  );
}

/** The graph's tabs: a classification (the stage) describes the condition, it
 *  does not go better or worse, so it is shown as a card and not as a line. */
export function graphSeries(series: readonly MeasureSeries[]): MeasureSeries[] {
  return series.filter((s) => !outcomeMeasure(s.measureKey)?.classification);
}

/** The newest review on the record - a recorded measurement or an exam, never
 *  a diary week - for "stale override" and "last review". */
export function neuroLastReviewAt(series: readonly MeasureSeries[]): string | null {
  let best: string | null = null;
  for (const s of series) {
    if (s.measureKey === "freezing_episodes") {
      // Only the therapist's own counts are a review; diary weeks are not.
      for (const p of s.points) {
        if (p.recordedBy === "patient") continue;
        if (best === null || Date.parse(p.measuredAt) > Date.parse(best)) best = p.measuredAt;
      }
      continue;
    }
    for (const p of s.points) {
      if (best === null || Date.parse(p.measuredAt) > Date.parse(best)) best = p.measuredAt;
    }
  }
  return best;
}

// --- Falls ---------------------------------------------------------------------------------

const DAY_MS = 86_400_000;
/** The window the "Falls" tile and card count: three months, the intake's own. */
export const FALLS_WINDOW_DAYS = 90;

/** Whether a fall entry stands without waiting for anyone: a physiotherapist
 *  confirmed it, or a clinician wrote it. A patient's unconfirmed one is
 *  "patient reported" and shown as such, but does not move the status pill. */
export function fallIsConfirmed(entry: Pick<DiaryEntry, "enteredByRole" | "confirmedAt">): boolean {
  return diaryProvenance(entry) !== "patient_reported";
}

/**
 * The status rule's "a new fall": a fall a physiotherapist has confirmed
 * (or a clinician recorded) that happened after the last review. With no
 * review yet, any confirmed fall counts. An unconfirmed patient report never
 * does (the owner's rule: the pill waits for a person to stand behind it).
 */
export function newConfirmedFall(entries: readonly DiaryEntry[], lastReviewAt: string | null): boolean {
  const since = lastReviewAt ? Date.parse(lastReviewAt) : NaN;
  return entries.some((e) => {
    if (e.kind !== "fall" || !fallIsConfirmed(e)) return false;
    const at = Date.parse(e.occurredAt);
    return Number.isFinite(at) && (!Number.isFinite(since) || at > since);
  });
}

export type FallsWindow = {
  falls: number;
  confirmed: number;
  patientReported: number;
  injured: number;
  nearMisses: number;
  latestFallAt: string | null;
};

export function fallsInWindow(entries: readonly DiaryEntry[], nowMs: number, days = FALLS_WINDOW_DAYS): FallsWindow {
  const from = nowMs - days * DAY_MS;
  const inside = entries.filter((e) => {
    const t = Date.parse(e.occurredAt);
    return Number.isFinite(t) && t >= from && t <= nowMs + 5 * 60_000;
  });
  const falls = inside.filter((e) => e.kind === "fall");
  const latest = falls.map((e) => e.occurredAt).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  return {
    falls: falls.length,
    confirmed: falls.filter(fallIsConfirmed).length,
    patientReported: falls.filter((e) => !fallIsConfirmed(e)).length,
    injured: falls.filter((e) => (e.details as FallDetails).injured === true).length,
    nearMisses: inside.filter((e) => e.kind === "near_miss").length,
    latestFallAt: latest,
  };
}

// --- The status rule's input ---------------------------------------------------------------

const MAIN_PREFERENCE: Record<NeuroKind, readonly string[]> = {
  neuro: ["barthel", "berg_balance", "ten_metre_walk", "fac", "fugl_meyer_ue", "tug", "mini_bestest"],
  neuro_parkinsons: ["tug", "ten_metre_walk", "mini_bestest", "five_sit_to_stand"],
};

/**
 * The line for one measure on a Parkinson's record: the ON line with the most
 * readings, else OFF, else whatever is there. A line whose state was not
 * recorded (joinPoints false) is the last choice. Elsewhere the one line.
 */
export function pickStateLine(series: readonly MeasureSeries[], measureKey: string): MeasureSeries | null {
  const lines = series.filter((s) => s.measureKey === measureKey && s.points.length > 0);
  if (lines.length === 0) return null;
  return [...lines].sort(
    (a, b) =>
      Number(b.joinPoints) - Number(a.joinPoints) ||
      STATE_ORDER[a.medicationState ?? ""] - STATE_ORDER[b.medicationState ?? ""] ||
      b.points.length - a.points.length
  )[0];
}

/**
 * What the status rule reads for a neurological record: the main measure (the
 * first of the kind's preference list that can be compared - at least two
 * points on a line whose points may be joined, a Parkinson's line only within
 * one medication state - else the first with any reading), and "a new fall"
 * only from a confirmed diary fall since the last review. `barthelEnabled`
 * keeps a licensed scale out of the choice while its licence is off.
 */
export function neuroStatusInput(input: {
  series: readonly MeasureSeries[];
  kind: NeuroKind;
  barthelEnabled: boolean;
  diary: readonly DiaryEntry[] | null;
  lastReviewAt: string | null;
}): StatusInput {
  const candidates = MAIN_PREFERENCE[input.kind]
    .filter((k) => k !== "barthel" || input.barthelEnabled)
    .map((k) => pickStateLine(input.series, k))
    .filter((s): s is MeasureSeries => s !== null && s.joinPoints && s.known);
  const main = candidates.find((s) => s.points.length >= 2) ?? candidates[0] ?? null;
  const newFall = input.diary ? newConfirmedFall(input.diary, input.lastReviewAt) : false;
  if (!main) return { main: null, newFall };
  const tester = (p: SeriesPoint) => p.testerName ?? p.recordedBy;
  return {
    main: {
      measureKey: main.measureKey,
      values: main.points.map((p) => p.value),
      profileKind: input.kind,
      differentTester: tester(main.points[0]) !== tester(main.points[main.points.length - 1]),
    },
    newFall,
  };
}

// --- The four key numbers ------------------------------------------------------------------

function placeholderTile(key: string, label: string, text: string, valueText = "Not yet"): KeyTile {
  return { key, label, fullLabel: label, valueText, sparkPath: null, deltaText: text, deltaTone: "neutral", goalText: null };
}

const COULDNT_LOAD = "We couldn't load this just now. It is not missing.";

/** The intake's 0-10 independence, asked again at each approved submission, as
 *  a tile: a plain 0-10 scale with no registry thresholds, so the move is
 *  worded and toned by the direction alone (higher is better) with a floor of
 *  one point before it is called a change. */
export function independenceIntakeTile(points: readonly IntakeTrendPoint[]): KeyTile {
  const label = "Independence (0 to 10)";
  if (points.length === 0) return placeholderTile("independence-intake", label, "Not asked yet");
  const first = points[0];
  const now = points[points.length - 1];
  const moved = Math.abs(now.value - first.value) >= 1;
  const delta =
    points.length < 2
      ? "First answer"
      : !moved
        ? "About the same as the first answer"
        : `${now.value > first.value ? "Up" : "Down"} ${Math.abs(now.value - first.value)} from ${first.value}`;
  return {
    key: "independence-intake",
    label,
    fullLabel: "How much of the day can be managed alone, 0 to 10, as answered on the intake",
    valueText: `${now.value} / 10`,
    sparkPath: sparklinePath(points.map((p) => p.value)),
    deltaText: delta,
    deltaTone: points.length < 2 || !moved ? "neutral" : now.value > first.value ? "good" : "bad",
    goalText: null,
  };
}

function fallsTile(input: {
  diary: readonly DiaryEntry[] | null;
  nowMs: number;
  baseline: string;
  voice: Voice;
}): KeyTile {
  const label = "Falls, last 3 months";
  if (input.diary === null) {
    return {
      key: "falls",
      label,
      fullLabel: label,
      valueText: "Unavailable",
      sparkPath: null,
      deltaText: "We couldn't load the diary just now, so this is not counted as none.",
      deltaTone: "neutral",
      goalText: input.baseline ? `Told us at the start: ${input.baseline}` : null,
    };
  }
  const w = fallsInWindow(input.diary, input.nowMs);
  const parts: string[] = [];
  if (w.falls === 0) parts.push("None written down");
  else {
    if (w.confirmed > 0) parts.push(`${w.confirmed} confirmed`);
    if (w.patientReported > 0) parts.push(input.voice === "patient" ? `${w.patientReported} you noted, not yet seen` : `${w.patientReported} patient reported`);
  }
  return {
    key: "falls",
    label,
    fullLabel: "Falls written in the diary in the last three months",
    valueText: String(w.falls),
    sparkPath: null,
    deltaText: parts.join(", "),
    deltaTone: w.confirmed > 0 ? "bad" : "neutral",
    goalText: w.latestFallAt ? `Latest: ${formatClinicDateShort(w.latestFallAt)}` : input.baseline ? `Told us at the start: ${input.baseline}` : null,
  };
}

/** One line as a tile, with its own wording where a Parkinson's reading has
 *  no recorded medication state (the move is then not claimed). */
function lineTile(
  s: MeasureSeries | null,
  fallbackKey: string,
  fallbackLabel: string,
  kind: ProfileKind,
  milestones: readonly MilestoneTarget[],
  voice: Voice,
  all: readonly MeasureSeries[],
  rename?: string
): KeyTile {
  if (!s) return placeholderTile(fallbackKey, rename ?? fallbackLabel, "Not measured yet");
  const tile = keyTile(s, milestones, kind, voice, all);
  return rename ? { ...tile, label: s.medicationState ? `${rename} (${s.medicationState.toUpperCase()})` : rename } : tile;
}

/**
 * Four tiles, always four, in this order:
 *   neuro:        independence, balance, walking speed, falls
 *   Parkinson's:  Up-and-go, freezing per week, walking speed, falls
 * Independence is the Barthel Index only when it is licensed on and has a
 * reading; otherwise the intake's own 0-10 answer over time. A tile with no
 * data says "Not yet" rather than being left out, so the row does not change
 * shape as readings arrive.
 */
export function neuroKeyTiles(input: {
  series: readonly MeasureSeries[];
  kind: NeuroKind;
  milestones: readonly MilestoneTarget[];
  voice: Voice;
  barthelEnabled: boolean;
  intakeIndependence: readonly IntakeTrendPoint[];
  diary: readonly DiaryEntry[] | null;
  nowMs: number;
  baselineFalls: string;
  /** Measure keys whose source could not be read (the exam's, the recorded
   *  measurements', the diary's): a tile with no line says so instead of
   *  "Not yet", which would read as nothing recorded. */
  unavailable?: ReadonlySet<string>;
}): KeyTile[] {
  const { series, kind, milestones, voice } = input;
  const tile = (key: string, label: string, rename?: string) => {
    const line = pickStateLine(series, key);
    if (!line && input.unavailable?.has(key)) return placeholderTile(key, rename ?? label, COULDNT_LOAD, "Unavailable");
    return lineTile(line, key, label, kind, milestones, voice, series, rename);
  };
  const falls = fallsTile({ diary: input.diary, nowMs: input.nowMs, baseline: input.baselineFalls, voice });
  if (kind === "neuro_parkinsons") {
    return [
      tile("tug", "Up-and-go", "Up-and-go"),
      tile("freezing_episodes", "Freezing per week", voice === "patient" ? "Feet getting stuck, per week" : "Freezing per week"),
      tile("ten_metre_walk", "Walking speed", "Walking speed"),
      falls,
    ];
  }
  const barthel = input.barthelEnabled ? pickStateLine(series, "barthel") : null;
  const independence = barthel
    ? lineTile(barthel, "barthel", "Independence", kind, milestones, voice, series, "Independence")
    : input.intakeIndependence.length === 0 && input.unavailable?.has("independence-intake")
      ? placeholderTile("independence-intake", "Independence (0 to 10)", COULDNT_LOAD, "Unavailable")
      : independenceIntakeTile(input.intakeIndependence);
  // Berg first; the Mini-BESTest is the harder test for someone who has outgrown it.
  const balance =
    !pickStateLine(series, "berg_balance") && pickStateLine(series, "mini_bestest")
      ? tile("mini_bestest", "Balance", "Balance")
      : tile("berg_balance", "Balance", "Balance");
  return [independence, balance, tile("ten_metre_walk", "Walking speed", "Walking speed"), falls];
}

// --- Words ---------------------------------------------------------------------------------

const oneDecimal = (n: number) => String(Number(n.toFixed(1)));

function lineMove(s: MeasureSeries, kind: ProfileKind): "better" | "worse" | "flat" {
  const first = s.points[0].value;
  const now = s.points[s.points.length - 1].value;
  if (first === now || !s.joinPoints) return "flat";
  const dir = changeDirection(s.measureKey, first, now, { profileKind: kind });
  return dir === "better" ? "better" : dir === "worse" ? "worse" : "flat";
}

/**
 * A few plain sentences built from the numbers alone, for when nobody has
 * written a summary: the draft the writing box starts from and, labelled as
 * generated, the card's fallback. Never a judgement. Null when there is
 * nothing to say.
 */
export function neuroStandSummary(input: {
  series: readonly MeasureSeries[];
  kind: NeuroKind;
  voice: Voice;
  barthelEnabled: boolean;
  intakeIndependence: readonly IntakeTrendPoint[];
  diary: readonly DiaryEntry[] | null;
  nowMs: number;
}): string | null {
  const you = input.voice === "patient";
  const sentences: string[] = [];
  const line = (key: string) => pickStateLine(input.series, key);
  const moveWords = (s: MeasureSeries, label: string, unit: string, decimals: number) => {
    const now = s.points[s.points.length - 1].value;
    const first = s.points[0].value;
    const nowText = readingText(now, decimals, unit);
    if (s.points.length < 2 || !s.joinPoints) return `${label} was ${nowText} at the latest review.`;
    const dir = lineMove(s, input.kind);
    const was = readingText(first, decimals, unit);
    return dir === "better"
      ? `${label} has improved from ${was} to ${nowText}.`
      : dir === "worse"
        ? `${label} has gone from ${was} to ${nowText}.`
        : `${label} is about where it was, ${nowText}.`;
  };

  if (input.kind === "neuro") {
    const barthel = input.barthelEnabled ? line("barthel") : null;
    if (barthel) sentences.push(moveWords(barthel, you ? "Managing the day on your own" : "Barthel Index", "0-100", 0).replace(/\.$/, " out of 100."));
    else if (input.intakeIndependence.length > 0) {
      const now = input.intakeIndependence[input.intakeIndependence.length - 1].value;
      sentences.push(`${you ? "Managing the day on your own" : "Independence"} was rated ${now} out of 10.`);
    }
    const berg = line("berg_balance");
    if (berg) {
      const now = berg.points[berg.points.length - 1].value;
      const risk = now <= 45 ? " That is still at or below the fall-risk line of 45." : " That is above the fall-risk line of 45.";
      sentences.push(`${moveWords(berg, you ? "Your balance score" : "Berg Balance Scale", "0-56", 0).replace(/\.$/, " out of 56.")}${risk}`);
    }
  } else {
    const tug = line("tug");
    if (tug) sentences.push(moveWords(tug, you ? "Getting up, walking three metres and sitting back down" : "Timed Up and Go", "seconds", 1));
    const freezing = line("freezing_episodes");
    if (freezing) sentences.push(moveWords(freezing, you ? "Feet getting stuck" : "Freezing", "episodes / week", 0).replace(/\.$/, " a week."));
  }
  const walk = line("ten_metre_walk");
  if (walk) sentences.push(moveWords(walk, you ? "Walking speed" : "Walking speed", "m/s", 2));

  if (input.diary !== null) {
    const w = fallsInWindow(input.diary, input.nowMs);
    if (w.falls === 0) sentences.push("No falls are written down for the last three months.");
    else sentences.push(`${w.falls} ${w.falls === 1 ? "fall is" : "falls are"} written down for the last three months${w.patientReported > 0 ? ` (${w.patientReported} not yet confirmed)` : ""}.`);
  }
  return sentences.length > 0 ? sentences.join(" ") : null;
}

// --- The condition line --------------------------------------------------------------------

/** The line under the name: the neurological condition and onset as the intake
 *  recorded them, trimmed to the first line. Null when not answered. */
export function neuroConditionLine(data: Readonly<Record<string, string>>): string | null {
  const text = (data.neuro_diagnosis ?? "").split("\n")[0].trim();
  return text || null;
}

// --- The affected side figure --------------------------------------------------------------

export type AffectedParts = { leftArm: boolean; rightArm: boolean; leftLeg: boolean; rightLeg: boolean; trunk: boolean };

/**
 * Which parts of the body the intake's "Which part of the body is affected?"
 * names. Sides are the patient's own (a patient's left is drawn on the
 * viewer's right, as a person facing you). Null for "Not sure", an
 * unanswered question or an answer the list does not hold - the figure is
 * then not drawn, never drawn as "nothing affected".
 */
export function affectedParts(answer: string | null | undefined): AffectedParts | null {
  const a = (answer ?? "").trim().toLowerCase();
  const none = { leftArm: false, rightArm: false, leftLeg: false, rightLeg: false, trunk: false };
  switch (a) {
    case "left side":
      return { ...none, leftArm: true, leftLeg: true };
    case "right side":
      return { ...none, rightArm: true, rightLeg: true };
    case "both sides":
    case "whole body":
      return { leftArm: true, rightArm: true, leftLeg: true, rightLeg: true, trunk: a === "whole body" };
    case "legs only":
      return { ...none, leftLeg: true, rightLeg: true };
    case "arms only":
      return { ...none, leftArm: true, rightArm: true };
    default:
      return null;
  }
}

// --- Walking ability (FAC) and walking speed -----------------------------------------------

export type LadderRung = { value: number; label: string };

export type WalkingLadder = {
  rungs: LadderRung[];
  now: number;
  nowAt: string;
  first: number | null;
  firstAt: string | null;
};

/** The Functional Ambulation Categories as a ladder from 0 to 5 with where
 *  the patient is now and where they began (the first reading, when it is
 *  not the latest). Null with no FAC recorded (a therapist enters it). */
export function walkingLadder(series: readonly MeasureSeries[]): WalkingLadder | null {
  const fac = series.find((s) => s.measureKey === "fac" && s.points.length > 0);
  const grades = outcomeMeasure("fac")?.grades;
  if (!fac || !grades) return null;
  const first = fac.points[0];
  const now = fac.points[fac.points.length - 1];
  return {
    rungs: grades.map((g) => ({ value: g.value, label: g.label })),
    now: now.value,
    nowAt: now.measuredAt,
    first: fac.points.length > 1 ? first.value : null,
    firstAt: fac.points.length > 1 ? first.measuredAt : null,
  };
}

export const SPEED_SCALE_MAX = 1.2;

export type SpeedZones = {
  now: number;
  first: number | null;
  nowBand: GaitSpeedBand;
  nowBandLabel: string;
  /** Marker positions along 0 to SPEED_SCALE_MAX, as 0-100. */
  nowPercent: number;
  firstPercent: number | null;
  medicationState: "on" | "off" | null;
};

const speedPercent = (v: number) => Math.round(Math.max(0, Math.min(1, v / SPEED_SCALE_MAX)) * 1000) / 10;

/** Walking speed against the three zones the exam's own bands use (under 0.4,
 *  0.4 to 0.8, 0.8 and over). Null with no walk timed. */
export function walkingSpeedZones(series: readonly MeasureSeries[]): SpeedZones | null {
  const s = pickStateLine(series, "ten_metre_walk");
  if (!s) return null;
  const now = s.points[s.points.length - 1].value;
  const first = s.points.length > 1 ? s.points[0].value : null;
  const band = gaitSpeedBand(now);
  return {
    now,
    first,
    nowBand: band,
    nowBandLabel: GAIT_SPEED_LABEL[band],
    nowPercent: speedPercent(now),
    firstPercent: first === null ? null : speedPercent(first),
    medicationState: s.medicationState,
  };
}

// --- Parkinson's: symptom profile, stage, freezing card -----------------------------------

export const PD_SYMPTOMS = ["Tremor", "Stiffness", "Slowness", "Freezing", "Balance", "Posture"] as const;

export type SymptomRow = { label: string; first: number | null; now: number | null };

export type SymptomProfile = {
  rows: SymptomRow[];
  firstAt: string | null;
  nowAt: string;
  total: { first: number | null; now: number };
  medicationState: "on" | "off" | null;
};

function itemsOf(point: MeasurementPoint): (number | null)[] | null {
  return Array.isArray(point.items) ? point.items : null;
}

/**
 * The physiotherapist's own six-part symptom rating (the registry's
 * `pd_symptom_rating`, 0 to 4 each, labelled as the clinic's rating and not
 * the MDS-UPDRS), first and latest, in one medication state: the ON ratings
 * if there are any, else OFF, else unrecorded ones. Null when no rating has
 * been recorded - the panel is then not drawn, and nothing is invented.
 */
export function symptomProfile(points: readonly MeasurementPoint[]): SymptomProfile | null {
  const rated = points.filter((p) => p.measureKey === "pd_symptom_rating" && itemsOf(p) !== null);
  if (rated.length === 0) return null;
  const state = (p: MeasurementPoint) => (p.conditions.medicationState === "on" || p.conditions.medicationState === "off" ? p.conditions.medicationState : null);
  const pick = rated.some((p) => state(p) === "on") ? "on" : rated.some((p) => state(p) === "off") ? "off" : null;
  const same = rated
    .filter((p) => state(p) === pick)
    .sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt));
  const now = same[same.length - 1];
  const first = same.length > 1 ? same[0] : null;
  const nowItems = itemsOf(now) ?? [];
  const firstItems = first ? itemsOf(first) : null;
  return {
    rows: PD_SYMPTOMS.map((label, i) => ({ label, first: firstItems ? firstItems[i] ?? null : null, now: nowItems[i] ?? null })),
    firstAt: first ? first.measuredAt : null,
    nowAt: now.measuredAt,
    total: { first: first ? first.value : null, now: now.value },
    medicationState: pick,
  };
}

export type ParkinsonStage = { value: number; label: string; since: string; at: string };

/** The Modified Hoehn and Yahr stage, if recorded: the latest, with how long it
 *  has stood at that value. The stage describes the condition and is never a
 *  goal, so it is shown as a fact. */
export function parkinsonStage(points: readonly MeasurementPoint[]): ParkinsonStage | null {
  const staged = points
    .filter((p) => p.measureKey === "hoehn_yahr")
    .sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt));
  if (staged.length === 0) return null;
  const now = staged[staged.length - 1];
  let since = now.measuredAt;
  for (let i = staged.length - 2; i >= 0 && staged[i].value === now.value; i--) since = staged[i].measuredAt;
  const label = outcomeMeasure("hoehn_yahr")?.grades?.find((g) => g.value === now.value)?.label ?? `Stage ${now.value}`;
  return { value: now.value, label, since, at: now.measuredAt };
}

export const FREEZING_TRIGGER_LABEL: Record<FreezingTrigger, string> = {
  starting: "Starting to walk",
  turning: "Turning round",
  doorway: "Doorways",
  crowded_or_narrow: "Crowded or narrow places",
  other: "Something else",
};

export type FreezingBar = {
  weekStart: string;
  episodes: number;
  written: boolean;
  /** Every entry that week stands on a physiotherapist's confirmation or a
   *  clinician's own record; false while any is only the patient's account. */
  confirmed: boolean;
  /** The week in progress: not a finished count. */
  partial: boolean;
};

/** The freezing bar chart's twelve weeks, oldest first. */
export function freezingBars(entries: readonly DiaryEntry[], nowMs: number, weeks = DIARY_WEEKS): FreezingBar[] {
  const thisWeek = clinicWeekStart(nowMs);
  const freezing = entries.filter((e) => e.kind === "freezing");
  return freezingWeeklySeries(entries, { nowMs, weeks }).map((w) => {
    const inWeek = freezing.filter((e) => clinicWeekStart(e.occurredAt) === w.weekStart);
    return {
      weekStart: w.weekStart,
      episodes: w.episodes,
      written: w.written,
      confirmed: inWeek.length > 0 && inWeek.every(fallIsConfirmed),
      partial: w.weekStart === thisWeek,
    };
  });
}

/** What was happening when the feet got stuck, most often first, over the
 *  twelve weeks. An entry that named no trigger is not counted under one. */
export function freezingTriggers(entries: readonly DiaryEntry[], nowMs: number, weeks = DIARY_WEEKS): { trigger: FreezingTrigger; label: string; episodes: number }[] {
  const from = Date.parse(`${clinicWeekStart(nowMs)}T00:00:00Z`) - (weeks - 1) * 7 * DAY_MS - DAY_MS;
  const tally = new Map<FreezingTrigger, number>();
  for (const e of entries) {
    if (e.kind !== "freezing" || Date.parse(e.occurredAt) < from) continue;
    const d = e.details as FreezingDetails;
    if (!d.trigger || !FREEZING_TRIGGERS.includes(d.trigger)) continue;
    tally.set(d.trigger, (tally.get(d.trigger) ?? 0) + (typeof d.count === "number" && d.count > 0 ? d.count : 1));
  }
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1] || FREEZING_TRIGGERS.indexOf(a[0]) - FREEZING_TRIGGERS.indexOf(b[0]))
    .map(([trigger, episodes]) => ({ trigger, label: FREEZING_TRIGGER_LABEL[trigger], episodes }));
}

/** Whether every ON/OFF measurement on the record was taken in ON time: the
 *  header's "Tested in ON time" chip. False with none recorded. */
export function testedInOnTime(series: readonly MeasureSeries[]): boolean {
  const states = series
    .filter((s) => outcomeMeasure(s.measureKey)?.medicationStateRequired && s.points.length > 0)
    .map((s) => s.medicationState);
  return states.length > 0 && states.every((s) => s === "on");
}

// A small helper the diary card shares with the tile: a count as "3 falls".
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "about half an hour", "about an hour", "about 2 hours" after a dose. */
export function afterDoseText(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return "";
  if (minutes < 20) return "just after";
  if (minutes < 45) return "about half an hour after";
  const hours = Math.round(minutes / 60);
  if (hours <= 1) return "about an hour after";
  return `about ${hours} hours after`;
}

/**
 * The header's "Tested in ON time" chip, only when every ON/OFF reading on the
 * record was taken in ON time (a mixed record has no single claim to make),
 * with how long after the dose the latest one was when its dose time was
 * recorded. Null otherwise - nothing is claimed that was not recorded.
 */
export function testedInOnTimeChip(
  series: readonly MeasureSeries[],
  points: readonly MeasurementPoint[],
  formatTime: (iso: string) => string
): string | null {
  if (!testedInOnTime(series)) return null;
  const latest = points
    .filter((p) => outcomeMeasure(p.measureKey)?.medicationStateRequired && p.conditions.medicationState === "on" && typeof p.conditions.lastDoseAt === "string")
    .sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt))[0];
  if (!latest) return "Tested in ON time";
  const minutes = (Date.parse(latest.measuredAt) - Date.parse(latest.conditions.lastDoseAt as string)) / 60_000;
  const when = afterDoseText(minutes);
  return when ? `Tested in ON time, ${when} the ${formatTime(latest.conditions.lastDoseAt as string)} dose` : "Tested in ON time";
}
