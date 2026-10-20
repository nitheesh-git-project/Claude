// The Health Profile's progress graph, as arithmetic.
//
// Every number the graph draws -- the y scale, the tick marks, the line, the
// green goal band, the dotted risk line, where each dot sits -- comes from
// here, so it is tested without rendering and the component is a thin
// loop over the result. Dependency-free on purpose (a type import from the
// registry only): business maths lives in src/lib/, not in JSX.
//
// Decisions worth knowing before changing anything:
//   - Dots are spaced evenly, one per review, not by calendar time. Two
//     reviews a fortnight apart and a third three months later would
//     otherwise bunch the first two into one blob, and the labels under
//     them would collide. The dates are printed, so no one is misled.
//   - The scale always contains every dot and the goal. A risk line is
//     drawn only when it is near the data; one far off the chart is
//     reported as "offscreen" so the screen can say it in words instead of
//     squashing the data against the bottom.
//   - "Better" decides the green band: higher is better paints from the
//     goal upwards, lower is better paints from the goal downwards. A
//     measure with no such direction gets a goal line and no band.
//   - A flat series and a one-point series are real cases (the first
//     review; a value that did not move) and get a sensible scale, never a
//     division by zero.

import type { BetterDirection } from "@/lib/outcomeMeasures";

export const CHART_WIDTH = 320;
export const CHART_HEIGHT = 190;
/** Left room for the tick labels, bottom room for the dates. */
export const CHART_PAD = { top: 14, right: 16, bottom: 28, left: 34 } as const;

const EPSILON = 1e-9;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// --- Ticks --------------------------------------------------------------------------

/** Round a step up to 1, 2, 2.5, 5 or 10 times a power of ten. */
function niceStep(rawStep: number): number {
  if (!(rawStep > 0)) return 1;
  const exponent = Math.floor(Math.log10(rawStep));
  const base = 10 ** exponent;
  const fraction = rawStep / base;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * base;
}

function cleanNumber(value: number): number {
  // 0.1 + 0.2 style noise out of tick values.
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Tick values at "nice" steps that cover [min, max]. The returned `min` and
 * `max` are the first and last tick, so the scale ends on a labelled line.
 * A zero-width range is widened first. `target` is the approximate number of
 * intervals wanted; the result has between 2 and about `target + 2` ticks.
 */
export function niceTicks(
  min: number,
  max: number,
  target = 4
): { ticks: number[]; min: number; max: number; step: number } {
  let lo = finite(min) ? min : 0;
  let hi = finite(max) ? max : lo + 1;
  if (lo > hi) [lo, hi] = [hi, lo];
  if (hi - lo < EPSILON) {
    const pad = Math.max(1, Math.abs(lo) * 0.1);
    lo -= pad;
    hi += pad;
  }
  const step = niceStep((hi - lo) / Math.max(1, target));
  const first = Math.floor(lo / step + EPSILON) * step;
  const last = Math.ceil(hi / step - EPSILON) * step;
  const ticks: number[] = [];
  for (let v = first, guard = 0; v <= last + step * 1e-6 && guard < 200; v += step, guard += 1) {
    ticks.push(cleanNumber(v));
  }
  return { ticks, min: ticks[0], max: ticks[ticks.length - 1], step };
}

// --- The scale ------------------------------------------------------------------------

export type ChartInput = {
  /** One value per review, oldest first. */
  values: readonly number[];
  better: BetterDirection | null;
  /** The target of the last planned step on this line. */
  goal?: number | null;
  /** A cut-off or norm drawn as a dotted line (TUG 12 s, 0.8 m/s...). */
  risk?: { value: number; label: string } | null;
  /** The measure's own range. The scale never runs outside it (a pain
   *  scale does not go below 0 because the dots are near it). */
  bounds?: { min: number; max: number } | null;
  width?: number;
  height?: number;
};

export type ChartPoint = { index: number; value: number; x: number; y: number };

export type ChartGeometry = {
  width: number;
  height: number;
  plot: { left: number; right: number; top: number; bottom: number };
  yMin: number;
  yMax: number;
  ticks: { value: number; y: number }[];
  points: ChartPoint[];
  /** "M x y L x y ..." or "" with no points. */
  linePath: string;
  /** The line closed down to the baseline, for a soft fill. */
  areaPath: string;
  goal: {
    value: number;
    y: number;
    /** The "good side" rectangle; null when the measure has no direction. */
    band: { y: number; height: number; side: "above" | "below" } | null;
  } | null;
  risk: {
    value: number;
    label: string;
    /** Null when the line is too far from the data to draw. */
    y: number | null;
    offscreen: "above" | "below" | null;
  } | null;
};

function r2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Distance from a value to a [lo, hi] range (0 inside it). */
function distanceOutside(value: number, lo: number, hi: number): number {
  if (value < lo) return lo - value;
  if (value > hi) return value - hi;
  return 0;
}

/** Whether a risk line is close enough to the data to be worth drawing: no
 *  further outside the data than the data's own span (or a unit for flat
 *  data). A cut-off of 12 s over TUGs of 8 to 10 s is drawn; a cut-off of
 *  120 over values near 3 is not. */
export function riskLineNearData(risk: number, dataMin: number, dataMax: number): boolean {
  const span = Math.max(dataMax - dataMin, Math.abs(dataMax) * 0.25, 1);
  return distanceOutside(risk, dataMin, dataMax) <= span;
}

/**
 * The whole chart: scale, ticks, points, line, goal band, risk line. Pure.
 * Returns points = [] for no values (the caller shows an empty state).
 */
export function buildChartGeometry(input: ChartInput): ChartGeometry {
  const width = input.width ?? CHART_WIDTH;
  const height = input.height ?? CHART_HEIGHT;
  const plot = {
    left: CHART_PAD.left,
    right: width - CHART_PAD.right,
    top: CHART_PAD.top,
    bottom: height - CHART_PAD.bottom,
  };
  const values = input.values.filter(finite);

  const goalValue = finite(input.goal) ? input.goal : null;
  const riskValue = input.risk && finite(input.risk.value) ? input.risk.value : null;

  const valuesMin = values.length ? Math.min(...values) : 0;
  const valuesMax = values.length ? Math.max(...values) : 1;
  const riskNear = riskValue !== null && riskLineNearData(riskValue, valuesMin, valuesMax);

  let lo = valuesMin;
  let hi = valuesMax;
  if (goalValue !== null) {
    lo = Math.min(lo, goalValue);
    hi = Math.max(hi, goalValue);
  }
  if (riskNear && riskValue !== null) {
    lo = Math.min(lo, riskValue);
    hi = Math.max(hi, riskValue);
  }
  // A little air above and below so a dot on the edge is not clipped.
  const air = (hi - lo) * 0.08;
  let scaleLo = lo - air;
  let scaleHi = hi + air;
  const bounds = input.bounds && finite(input.bounds.min) && finite(input.bounds.max) ? input.bounds : null;
  if (bounds) {
    scaleLo = Math.max(scaleLo, bounds.min);
    scaleHi = Math.min(scaleHi, bounds.max);
    if (scaleHi - scaleLo < EPSILON) {
      // A flat series sitting on a bound.
      scaleLo = Math.max(bounds.min, lo - 1);
      scaleHi = Math.min(bounds.max, hi + 1);
    }
  }
  const nice = niceTicks(scaleLo, scaleHi, 4);
  let yMin = nice.min;
  let yMax = nice.max;
  let ticks = nice.ticks;
  if (bounds) {
    // Nice rounding may step outside the measure's own range; keep to it.
    yMin = Math.max(yMin, bounds.min);
    yMax = Math.min(yMax, bounds.max);
    ticks = ticks.filter((t) => t >= yMin - EPSILON && t <= yMax + EPSILON);
    if (yMax - yMin < EPSILON) {
      yMin = bounds.min;
      yMax = bounds.max;
    }
  }
  const span = yMax - yMin || 1;
  const plotHeight = plot.bottom - plot.top;
  const yFor = (value: number) => r2(plot.bottom - ((Math.min(yMax, Math.max(yMin, value)) - yMin) / span) * plotHeight);

  const n = values.length;
  const xFor = (i: number) => r2(n <= 1 ? (plot.left + plot.right) / 2 : plot.left + (i * (plot.right - plot.left)) / (n - 1));
  const points: ChartPoint[] = values.map((value, index) => ({ index, value, x: xFor(index), y: yFor(value) }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x} ${plot.bottom} L ${points[0].x} ${plot.bottom} Z`
      : "";

  let goal: ChartGeometry["goal"] = null;
  if (goalValue !== null) {
    const y = yFor(goalValue);
    let band: NonNullable<ChartGeometry["goal"]>["band"] = null;
    if (input.better === "higher") band = { y: plot.top, height: r2(Math.max(0, y - plot.top)), side: "above" };
    else if (input.better === "lower") band = { y, height: r2(Math.max(0, plot.bottom - y)), side: "below" };
    goal = { value: goalValue, y, band };
  }

  let risk: ChartGeometry["risk"] = null;
  if (riskValue !== null && input.risk) {
    const offscreen = riskNear ? null : riskValue > valuesMax ? "above" : "below";
    risk = { value: riskValue, label: input.risk.label, y: riskNear ? yFor(riskValue) : null, offscreen };
  }

  return {
    width,
    height,
    plot,
    yMin,
    yMax,
    ticks: ticks.map((value) => ({ value, y: yFor(value) })),
    points,
    linePath,
    areaPath,
    goal,
    risk,
  };
}

// --- Labels ---------------------------------------------------------------------------

/**
 * Which of `count` dots get a date under them: the first and last always,
 * the rest spread evenly, never more than `max` so the dates cannot collide
 * on a 360 px screen. Indices in ascending order.
 */
export function labelIndices(count: number, max: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const slots = Math.max(2, Math.min(max, count));
  const out = new Set<number>();
  for (let s = 0; s < slots; s += 1) out.add(Math.round((s * (count - 1)) / (slots - 1)));
  return [...out].sort((a, b) => a - b);
}

/** Text anchor for a date label so the end labels stay inside the chart. */
export function labelAnchor(index: number, count: number): "start" | "middle" | "end" {
  if (count <= 1) return "middle";
  if (index === 0) return "start";
  if (index === count - 1) return "end";
  return "middle";
}

// --- Numbers as words ---------------------------------------------------------------------

/** A reading to its measure's stored precision, trailing zeros dropped
 *  ("3.50" -> "3.5", "122.0" -> "122"). */
export function formatMeasureValue(value: number, decimals: number): string {
  if (!finite(value)) return "-";
  const fixed = value.toFixed(Math.max(0, Math.min(6, decimals)));
  return fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
}

/** The unit as it follows a number: degrees and per cent attach, a range
 *  label ("0-80", "stage 0-4") says nothing after a number, a word gets a
 *  space. */
export function unitSuffix(unit: string): string {
  const u = unit.trim();
  if (!u) return "";
  if (u === "%") return "%";
  if (u === "degrees") return "°";
  if (/^[\d\s–-]+$/.test(u)) return "";
  if (/^(stage|grade|level|raw score|standard score)\b/i.test(u)) return "";
  return ` ${u}`;
}

export function formatReading(value: number, decimals: number, unit: string): string {
  return `${formatMeasureValue(value, decimals)}${unitSuffix(unit)}`;
}

export type DeltaTone = "good" | "bad" | "neutral";

export type Delta = {
  /** "Up 37°", "Down 4", "No change". */
  text: string;
  amount: number;
  tone: DeltaTone;
};

/**
 * First-to-now in words. `change` is outcomeMeasures.changeDirection() -- the
 * only judge of whether a move is real and good -- so a move inside the
 * measurement error reads "No real change" in neutral, never green. null
 * (one review, or a measure the registry lost) gives null.
 */
export function describeDelta(input: {
  first: number;
  now: number;
  decimals: number;
  unit: string;
  change: "better" | "worse" | "no_change" | "changed" | null;
}): Delta | null {
  const { first, now, decimals, unit, change } = input;
  if (!finite(first) || !finite(now) || change === null) return null;
  const amount = Math.abs(now - first);
  if (amount < EPSILON) return { text: "No change", amount: 0, tone: "neutral" };
  const shown = `${formatMeasureValue(amount, decimals)}${unitSuffix(unit)}`;
  const direction = now > first ? "Up" : "Down";
  if (change === "no_change") return { text: `${direction} ${shown}, within the usual error`, amount, tone: "neutral" };
  return { text: `${direction} ${shown}`, amount, tone: change === "better" ? "good" : change === "worse" ? "bad" : "neutral" };
}

// --- Sparkline -------------------------------------------------------------------------

/** A tiny line for a tile: `width` x `height` box, null for fewer than two
 *  values (a single dot is not a trend), a mid-height line when flat. */
export function sparklinePath(values: readonly number[], width = 100, height = 28, pad = 3): string | null {
  const v = values.filter(finite);
  if (v.length < 2) return null;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const span = hi - lo;
  return v
    .map((value, i) => {
      const x = (i * width) / (v.length - 1);
      const y = span < EPSILON ? height / 2 : height - pad - ((value - lo) / span) * (height - 2 * pad);
      return `${i === 0 ? "M" : "L"} ${r2(x)} ${r2(y)}`;
    })
    .join(" ");
}

/** The sentence a screen reader gets for the graph. */
export function chartSummaryText(input: {
  label: string;
  unit: string;
  decimals: number;
  points: readonly { value: number; dateLabel: string }[];
  goal?: number | null;
  better: BetterDirection | null;
}): string {
  const { label, unit, decimals, points, goal, better } = input;
  if (points.length === 0) return `${label}: nothing recorded yet.`;
  const reading = (v: number) => formatReading(v, decimals, unit);
  const first = points[0];
  const last = points[points.length - 1];
  const parts =
    points.length === 1
      ? [`${label}: ${reading(first.value)} on ${first.dateLabel}, the only review so far.`]
      : [
          `${label}: ${reading(first.value)} on ${first.dateLabel}, ${reading(last.value)} on ${last.dateLabel}, over ${points.length} reviews.`,
        ];
  if (goal !== null && goal !== undefined && finite(goal)) {
    const word = better === "lower" ? "or lower" : better === "higher" ? "or higher" : "";
    parts.push(`Goal ${reading(goal)}${word ? ` ${word}` : ""}.`);
  }
  return parts.join(" ");
}
