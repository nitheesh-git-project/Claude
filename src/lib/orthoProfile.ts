import { latestAssessmentByRegionSide, PAIN_MAP_REGIONS, formatPainOutOfTen, type PainAssessmentRow } from "@/lib/painMap";
import { painTrendSeries } from "@/lib/healthProfileSummary";
import { extensionLag } from "@/lib/clinicalCalculators";
import { changeDirection, outcomeMeasure, usualJointRange, type MeasurementSide } from "@/lib/outcomeMeasures";
import {
  goalForSeries,
  seriesKeyFor,
  type MeasureSeries,
  type MilestoneTarget,
  type SeriesPoint,
} from "@/lib/outcomeSeries";
import type { StatusInput } from "@/lib/profileStatus";
import { readingText } from "@/lib/progressView";
import type { Voice } from "@/lib/progressView";

// What the orthopaedic Health Profile draws, worked out in one tested place
// so the patient's page, the therapist's chart and the admin's chart cannot
// each grow their own idea of "the knee line" or "the main measure".
// Dependency-free of React and Supabase; nothing here reads a clock.
//
// The Pain Map owns pain (measurementSource("pain_nprs") === "pain_map"):
// nothing is written to outcome_measurements for it. To draw it beside the
// range, strength and LEFS lines it is turned into one more MeasureSeries
// here - overall pain after each exam on a 0-10 scale (painTrendSeries'
// per-exam average, shown to one decimal), never a second store.

const PAIN_KEY = "pain_nprs";
const PAIN_SOURCE = "pain_map";

/** Overall pain after each exam as a line like any other, or null when no exam is on record. */
export function painMapSeries(assessments: readonly PainAssessmentRow[]): MeasureSeries | null {
  const trend = painTrendSeries([...assessments]);
  if (trend.length === 0) return null;
  const m = outcomeMeasure(PAIN_KEY);
  const points: SeriesPoint[] = trend.map((p) => ({
    measurementId: `pain-map:${p.date}`,
    value: Math.round(p.percent) / 10,
    measuredAt: p.date,
    reviewKey: `pain-map:${p.date}`,
    appointmentId: null,
    setting: null,
    recordedBy: PAIN_SOURCE,
    testerName: null,
    estimatedFromImage: false,
    readingsInReview: 1,
  }));
  return {
    key: seriesKeyFor({ measureKey: PAIN_KEY, variant: null, side: null }),
    measureKey: PAIN_KEY,
    variant: null,
    side: null,
    medicationState: null,
    joinPoints: true,
    known: !!m,
    label: "Pain (Pain Map, average across areas)",
    plainName: "Pain score",
    variantLabel: null,
    unit: m?.unit ?? "0-10",
    decimals: 1,
    better: m?.better ?? "lower",
    points,
  };
}

/** The lines the page draws: pain first (the number every patient asks about), then the recorded measures. */
export function orthoSeries(recorded: readonly MeasureSeries[], assessments: readonly PainAssessmentRow[]): MeasureSeries[] {
  const pain = painMapSeries(assessments);
  // A pain line from the table would be a second source for the same line.
  const rest = recorded.filter((s) => s.measureKey !== PAIN_KEY);
  return pain ? [pain, ...rest] : rest;
}

/** The newest instant on the record - a measurement or a Pain Map exam - for "stale override" and "last review". */
export function latestReviewAt(series: readonly MeasureSeries[]): string | null {
  let best: string | null = null;
  for (const s of series) {
    for (const p of s.points) {
      if (best === null || Date.parse(p.measuredAt) > Date.parse(best)) best = p.measuredAt;
    }
  }
  return best;
}

// --- The body map's two views and its per-area cards -----------------------------------------

/** The earliest row for each (region, side): "what the first exam found". */
export function firstAssessmentsByRegionSide(assessments: readonly PainAssessmentRow[]): PainAssessmentRow[] {
  const first = new Map<string, PainAssessmentRow>();
  for (const a of assessments) {
    const key = `${a.region}:${a.side}`;
    const held = first.get(key);
    if (!held || Date.parse(a.created_at) < Date.parse(held.created_at)) first.set(key, a);
  }
  return [...first.values()];
}

export type AreaChange = "better" | "worse" | "same" | "only_one";

export type AreaProgress = {
  key: string;
  label: string;
  /** Stored 0-100. */
  firstPercent: number;
  nowPercent: number;
  firstText: string;
  nowText: string;
  firstAt: string;
  nowAt: string;
  change: AreaChange;
  /** "Down 4 points" / "Up 1 point" / "No change" / "Not re-scored yet". */
  changeText: string;
};

function areaLabel(region: string, side: string): string {
  const def = PAIN_MAP_REGIONS.find((r) => r.key === region);
  if (!def) return region;
  return def.paired && side !== "na" ? `${def.label} (${side})` : def.label;
}

/**
 * One card per area examined: its first score, its latest, and the move -
 * worst current score first. A move is judged on the 0-10 scale the patient
 * reads; an area examined once says so rather than showing a change of nothing.
 */
export function areaProgress(assessments: readonly PainAssessmentRow[]): AreaProgress[] {
  const latest = latestAssessmentByRegionSide([...assessments]);
  const first = new Map(firstAssessmentsByRegionSide(assessments).map((a) => [`${a.region}:${a.side}`, a]));
  const out: AreaProgress[] = [];
  for (const [key, now] of latest) {
    const start = first.get(key) ?? now;
    const single = start.created_at === now.created_at;
    const diffTenths = Math.round(now.pain_percent / 10 * 10) / 10 - Math.round(start.pain_percent / 10 * 10) / 10;
    const diff = Math.round(diffTenths * 10) / 10;
    const change: AreaChange = single ? "only_one" : diff < 0 ? "better" : diff > 0 ? "worse" : "same";
    const abs = Math.abs(diff);
    out.push({
      key,
      label: areaLabel(now.region, now.side),
      firstPercent: start.pain_percent,
      nowPercent: now.pain_percent,
      firstText: formatPainOutOfTen(start.pain_percent),
      nowText: formatPainOutOfTen(now.pain_percent),
      firstAt: start.created_at,
      nowAt: now.created_at,
      change,
      changeText:
        change === "only_one"
          ? "Not re-scored yet"
          : change === "same"
            ? "No change"
            : `${change === "better" ? "Down" : "Up"} ${abs} ${abs === 1 ? "point" : "points"}`,
    });
  }
  return out.sort((a, b) => b.nowPercent - a.nowPercent || a.label.localeCompare(b.label));
}

// --- The two visuals --------------------------------------------------------------------------

const lastPoint = (s: MeasureSeries): SeriesPoint => s.points[s.points.length - 1];

function newestFirst(a: MeasureSeries, b: MeasureSeries): number {
  return Date.parse(lastPoint(b).measuredAt) - Date.parse(lastPoint(a).measuredAt);
}

export type KneeBend = {
  series: MeasureSeries;
  side: MeasurementSide | null;
  mode: "active" | "passive";
  first: number;
  now: number;
  goal: number | null;
  goalReached: boolean;
  /** The usual range the dial's scale is built around. */
  usual: number;
};

/**
 * The line the knee-bend dial shows: the newest reading of knee bend across
 * both sides and both modes, active before passive on a tie. One dial, one
 * line - the other lines stay in the graph and the table. Null with no knee
 * bend recorded.
 */
export function pickKneeBend(series: readonly MeasureSeries[], milestones: readonly MilestoneTarget[]): KneeBend | null {
  const lines = series.filter((s) => s.measureKey === "joint_range" && s.points.length > 0 && /^knee_flexion_(active|passive)$/.test(s.variant ?? ""));
  if (lines.length === 0) return null;
  const best = [...lines].sort((a, b) => newestFirst(a, b) || (a.variant === "knee_flexion_active" ? -1 : 1))[0];
  const goal = goalForSeries(best, milestones);
  return {
    series: best,
    side: best.side,
    mode: best.variant === "knee_flexion_passive" ? "passive" : "active",
    first: best.points[0].value,
    now: lastPoint(best).value,
    goal: goal?.value ?? null,
    goalReached: goal?.reached ?? false,
    usual: usualJointRange("knee_flexion_active") ?? 135,
  };
}

export type LegStrength = {
  series: MeasureSeries;
  side: MeasurementSide | null;
  /** The muscle group, in words ("Thigh, front (quadriceps)"). */
  group: string;
  first: number;
  now: number;
  goal: number;
  goalIsMilestone: boolean;
};

/** The registry's own fixed target for strength compared with the other side. */
function strengthNormTarget(): number {
  const norm = outcomeMeasure("strength_symmetry")?.norm;
  return norm && norm.kind === "fixed" && norm.value !== undefined ? norm.value : 90;
}

/**
 * The line the strength bar shows: the front-of-thigh line if there is one,
 * else the newest. Goal: the plan's milestone for exactly this line, else the
 * registry's 90% before running or sport. Null with no strength recorded.
 */
export function pickLegStrength(series: readonly MeasureSeries[], milestones: readonly MilestoneTarget[]): LegStrength | null {
  const lines = series.filter((s) => s.measureKey === "strength_symmetry" && s.points.length > 0);
  if (lines.length === 0) return null;
  const quads = lines.filter((s) => s.variant === "quadriceps");
  const best = [...(quads.length > 0 ? quads : lines)].sort(newestFirst)[0];
  const goal = goalForSeries(best, milestones);
  return {
    series: best,
    side: best.side,
    group: best.variantLabel ?? "Strength",
    first: best.points[0].value,
    now: lastPoint(best).value,
    goal: goal?.value ?? strengthNormTarget(),
    goalIsMilestone: goal?.source === "milestone",
  };
}

export type StraighteningReading = { now: number; first: number };

export type KneeStraightening = {
  side: MeasurementSide | null;
  passive: StraighteningReading | null;
  active: StraighteningReading | null;
  /** Active against passive, now and at the first review both lines have; null until both exist. */
  lag: { now: number; first: number | null } | null;
};

/** Both straightening lines of one side and the extension lag derived from them. */
export function kneeStraightening(series: readonly MeasureSeries[], side: MeasurementSide | null): KneeStraightening | null {
  const find = (variant: string) =>
    series.find((s) => s.measureKey === "joint_range" && s.variant === variant && (s.side ?? null) === side && s.points.length > 0) ?? null;
  const passive = find("knee_extension_passive");
  const active = find("knee_extension_active");
  if (!passive && !active) return null;
  const reading = (s: MeasureSeries | null): StraighteningReading | null =>
    s ? { now: lastPoint(s).value, first: s.points[0].value } : null;
  const p = reading(passive);
  const a = reading(active);
  let lag: KneeStraightening["lag"] = null;
  if (p && a) {
    const now = extensionLag(p.now, a.now);
    const first = extensionLag(p.first, a.first);
    if (now.ok) lag = { now: now.value, first: first.ok ? first.value : null };
  }
  return { side, passive: p, active: a, lag };
}

/** "0 degrees", "-8 degrees (8 short of straight)". */
export function straighteningText(value: number): string {
  if (value === 0) return "0° (straight)";
  return value < 0 ? `${value}° (${Math.abs(value)}° short of straight)` : `+${value}° (past straight)`;
}

// --- The status and the words -------------------------------------------------------------------

/**
 * What the status rule reads. The main measure is the Pain Map's pain line
 * when an exam is on record (the number every patient is asking about), else
 * the recorded line with the most reviews. Falls and red flags are not
 * collected for an orthopaedic profile, so neither is passed.
 */
export function orthoStatusInput(series: readonly MeasureSeries[]): StatusInput {
  const pain = series.find((s) => s.measureKey === PAIN_KEY && s.points.length > 0);
  const main =
    pain ??
    [...series].filter((s) => s.known && s.points.length > 0).sort((a, b) => b.points.length - a.points.length)[0] ??
    null;
  if (!main) return { main: null };
  const tester = (p: SeriesPoint) => p.testerName ?? p.recordedBy;
  const first = main.points[0];
  const now = lastPoint(main);
  return {
    main: {
      measureKey: main.measureKey,
      values: main.points.map((p) => p.value),
      profileKind: "ortho",
      normal: main.variant ? usualJointRange(main.variant) ?? undefined : undefined,
      differentTester: tester(first) !== tester(now),
    },
  };
}

function moved(first: number, now: number, measureKey: string): "better" | "worse" | "flat" {
  if (first === now) return "flat";
  const dir = changeDirection(measureKey, first, now, { profileKind: "ortho" });
  return dir === "worse" ? "worse" : dir === "better" ? "better" : "flat";
}

const oneDecimal = (n: number) => String(Number(n.toFixed(1)));

/**
 * The few plain sentences under the header, built from the numbers alone (no
 * one has written a summary for this patient): pain, the knee, the leg, the
 * everyday-tasks score - whichever exist. null when there is nothing to say.
 * `voice` only changes whose pronoun it is.
 */
export function standSummary(
  series: readonly MeasureSeries[],
  milestones: readonly MilestoneTarget[],
  voice: Voice
): string | null {
  const you = voice === "patient";
  const sentences: string[] = [];

  const pain = series.find((s) => s.measureKey === PAIN_KEY && s.points.length > 0);
  if (pain) {
    const first = pain.points[0].value;
    const now = lastPoint(pain).value;
    const f = oneDecimal(first);
    const n = oneDecimal(now);
    if (pain.points.length < 2) sentences.push(`${you ? "Your" : "Overall"} pain was scored ${n} out of 10 at the first exam.`);
    else if (moved(first, now, PAIN_KEY) === "better") sentences.push(`${you ? "Your" : "Overall"} pain is down from ${f} to ${n} out of 10.`);
    else if (moved(first, now, PAIN_KEY) === "worse") sentences.push(`${you ? "Your" : "Overall"} pain is up from ${f} to ${n} out of 10.`);
    else sentences.push(`${you ? "Your" : "Overall"} pain is about where it was, ${n} out of 10.`);
  }

  const knee = pickKneeBend(series, milestones);
  if (knee) {
    const side = knee.side ? `${knee.side} ` : "";
    const goal = knee.goal !== null ? ` (goal ${knee.goal}°)` : "";
    sentences.push(`The ${side}knee ${knee.mode === "passive" ? "can be bent to" : "now bends to"} ${knee.now}°${goal}.`);
  }

  const leg = pickLegStrength(series, milestones);
  if (leg) {
    const side = leg.side ? `${leg.side} ` : "";
    sentences.push(`${you ? "Your" : "The"} ${side}leg strength is ${readingText(leg.now, 0, "%")} of the other side (goal ${leg.goal}%).`);
  }

  const lefs = series.find((s) => s.measureKey === "lefs" && s.points.length > 0);
  if (lefs) {
    const now = lastPoint(lefs).value;
    sentences.push(`Everyday tasks with the legs score ${now} out of 80${lefs.points.length > 1 ? ` (it was ${lefs.points[0].value})` : ""}.`);
  }

  return sentences.length > 0 ? sentences.join(" ") : null;
}
