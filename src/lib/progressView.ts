// Words and picks for the Health Profile's progress screens, kept out of the
// components so they are tested and so the graph, the tiles and the table
// call every line the same thing.

import { changeDirection, outcomeMeasure, usualJointRange, type OutcomeMeasure, type ProfileKind } from "@/lib/outcomeMeasures";
import { goalForSeries, type MeasureSeries, type MilestoneTarget } from "@/lib/outcomeSeries";
import { PHASES_BY_PROFILE_KIND } from "@/lib/milestoneTemplates";
import { describeDelta, formatMeasureValue, sparklinePath, unitSuffix, type Delta, type DeltaTone } from "@/lib/progressChart";

export type Voice = "patient" | "clinician";

type LineLike = Pick<MeasureSeries, "label" | "plainName" | "variantLabel" | "side" | "medicationState">;

/** The name of one line: a patient reads the plain name ("Strength compared
 *  with the other side"), a clinician the test's own ("Limb symmetry index"),
 *  each with the variant, side and, for Parkinson's, the medication state
 *  that keep two lines of one test apart. */
export function seriesName(s: LineLike, voice: Voice): string {
  const base = voice === "clinician" ? s.label : s.plainName;
  const parts = [base];
  if (s.variantLabel) parts.push(s.variantLabel);
  const tail: string[] = [];
  if (s.side) tail.push(s.side === "left" ? "left" : "right");
  if (s.medicationState) tail.push(s.medicationState === "on" ? "ON" : "OFF");
  return tail.length ? `${parts.join(" - ")} (${tail.join(", ")})` : parts.join(" - ");
}

/** The short label on a tab: the plain name only, so a row of tabs fits. */
export function seriesTabLabel(s: LineLike, voice: Voice): string {
  return seriesName(s, voice);
}

/** "Lower Extremity Functional Scale (LEFS), 0 to 80. Higher is better." */
export function scaleLine(measureKey: string): string | null {
  const m = outcomeMeasure(measureKey);
  if (!m) return null;
  const range = m.grades ? `grades ${m.grades[0].value} to ${m.grades[m.grades.length - 1].value}` : `${m.min} to ${m.max}${unitSuffix(m.unit)}`;
  const direction =
    m.better === "higher"
      ? "Higher is better."
      : m.better === "lower"
        ? "Lower is better."
        : m.better === "toward_normal"
          ? "Closer to the usual range is better."
          : m.better === "earlier"
            ? "Earlier is better."
            : "A level, not a score that goes better or worse.";
  return `${m.label}, ${range}. ${direction}`;
}

/** The "lower is better" / "higher is better" hint a patient reads under
 *  the graph. */
export function directionHint(better: MeasureSeries["better"]): string | null {
  switch (better) {
    case "higher":
      return "Higher is better.";
    case "lower":
      return "Lower is better.";
    case "toward_normal":
      return "Closer to the usual range is better.";
    case "earlier":
      return "Reaching it earlier is better.";
    case "hold":
      return "This describes a level; it does not go better or worse.";
    default:
      return null;
  }
}

/**
 * The dotted line on a measure's graph for a profile kind: the first fixed
 * cut-off that applies (Timed Up and Go 12 s, gait speed 0.8 m/s), else a
 * fixed norm (90% of the other side). An age-and-sex or patient-limit line
 * needs facts this view does not have, so it is not drawn here (the status
 * strip says it needs them) -- a check that could not be run is not a line
 * at zero.
 */
export function riskLineFor(measureKey: string, kind: ProfileKind): { value: number; label: string } | null {
  const m = outcomeMeasure(measureKey);
  if (!m) return null;
  for (const c of m.cutOffs ?? []) {
    if (c.type !== "fixed") continue;
    if (c.profileKinds && !c.profileKinds.includes(kind)) continue;
    return { value: c.value, label: c.label };
  }
  if (m.norm?.kind === "fixed" && m.norm.value !== undefined) return { value: m.norm.value, label: m.norm.label };
  return null;
}

/** The registry's own range, for the chart's scale; a stage or a joint
 *  range that can run negative is still bounded by it. */
export function boundsFor(m: OutcomeMeasure | null): { min: number; max: number } | null {
  return m ? { min: m.min, max: m.max } : null;
}

/**
 * Up to `max` lines worth a headline tile: those with the most reviews
 * first (a tile with a sparkline needs a trend), then registry order. A
 * line the registry no longer knows is skipped.
 */
export function pickHeadlineSeries(series: readonly MeasureSeries[], max = 4): MeasureSeries[] {
  return series
    .map((s, index) => ({ s, index }))
    .filter(({ s }) => s.known && s.points.length > 0)
    .sort((a, b) => b.s.points.length - a.s.points.length || a.index - b.index)
    .slice(0, max)
    .map(({ s }) => s);
}

/** The reading beside its unit, "122°", "0.85 m/s", "58". */
export function readingText(value: number, decimals: number, unit: string): string {
  return `${formatMeasureValue(value, decimals)}${unitSuffix(unit)}`;
}

/**
 * First-to-now for one line, in words and tone, judged by the registry
 * (changeDirection): a move inside the measurement error is neutral, and a
 * different tester between the two widens the allowance. null with one
 * review or for a line the registry no longer holds.
 */
export function seriesDelta(s: MeasureSeries, profileKind: ProfileKind): Delta | null {
  if (!s.known || s.points.length < 2) return null;
  const first = s.points[0];
  const now = s.points[s.points.length - 1];
  const tester = (p: MeasureSeries["points"][number]) => p.testerName ?? p.recordedBy;
  const change = changeDirection(s.measureKey, first.value, now.value, {
    profileKind,
    normal: s.variant ? usualJointRange(s.variant) ?? undefined : undefined,
    differentTester: tester(first) !== tester(now),
  });
  return describeDelta({ first: first.value, now: now.value, decimals: s.decimals, unit: s.unit, change });
}

export type KeyTile = {
  key: string;
  label: string;
  valueText: string;
  sparkPath: string | null;
  deltaText: string;
  deltaTone: DeltaTone;
  goalText: string | null;
};

/** One headline tile: the latest reading, a sparkline once there are two
 *  reviews, the move since the first, and the goal. */
export function keyTile(s: MeasureSeries, milestones: readonly MilestoneTarget[], profileKind: ProfileKind, voice: Voice): KeyTile {
  const first = s.points[0];
  const now = s.points[s.points.length - 1];
  const delta = seriesDelta(s, profileKind);
  const goal = goalForSeries(s, milestones);
  return {
    key: s.key,
    label: seriesName(s, voice),
    valueText: readingText(now.value, s.decimals, s.unit),
    sparkPath: sparklinePath(s.points.map((p) => p.value)),
    deltaText: delta
      ? `${delta.text} from ${readingText(first.value, s.decimals, s.unit)}`
      : s.points.length > 1
        ? "Change not judged for this measure"
        : "First reading",
    deltaTone: delta?.tone ?? "neutral",
    goalText: goal ? `Goal: ${readingText(goal.value, s.decimals, s.unit)}${goal.reached ? " (reached)" : ""}` : null,
  };
}

/**
 * The phase the course is in, read off the plan: the phase of the first
 * milestone not yet reached (in plan order), else of the last one reached.
 * The physiotherapist sets milestones' phases; moving on follows criteria,
 * so this is a suggestion a screen may show when no phase was set by hand.
 * null when no milestone carries a phase of this kind.
 */
export function inferPhase(
  milestones: readonly { status: string; reachedAt: string | null; phase: string | null; sortOrder: number }[],
  kind: ProfileKind
): string | null {
  const valid = PHASES_BY_PROFILE_KIND[kind];
  const ordered = milestones
    .filter((m) => m.phase !== null && valid.includes(m.phase))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (ordered.length === 0) return null;
  const open = ordered.find((m) => m.reachedAt === null && m.status !== "reached");
  return (open ?? ordered[ordered.length - 1]).phase;
}
