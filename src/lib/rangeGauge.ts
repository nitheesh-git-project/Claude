// Geometry for the two small visuals on the orthopaedic body-map card: the
// knee-bend half-dial and the leg-strength bar. Pure numbers in, numbers out,
// so the arithmetic can be tested without rendering and the components stay
// thin. None of it reads a clock.

/** The half-dial: a 100-unit-wide arc, drawn as a path of length 100. */
export const GAUGE_VIEWBOX = { width: 120, height: 70 } as const;
export const GAUGE_CENTRE = { x: 60, y: 62 } as const;
export const GAUGE_RADIUS = 50;
/** Path of the arc from the left end to the right end through the top. */
export const GAUGE_ARC_PATH = `M${GAUGE_CENTRE.x - GAUGE_RADIUS} ${GAUGE_CENTRE.y} A${GAUGE_RADIUS} ${GAUGE_RADIUS} 0 0 1 ${GAUGE_CENTRE.x + GAUGE_RADIUS} ${GAUGE_CENTRE.y}`;

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** 0 to 1: where `value` sits between `min` and `max`; clamped, 0 for a degenerate scale. */
export function fractionOf(value: number, min: number, max: number): number {
  if (![value, min, max].every(Number.isFinite) || max <= min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/** A point on the arc at a fraction (0 = left end, 1 = right end). */
export function pointOnArc(fraction: number): { x: number; y: number } {
  const f = Math.min(1, Math.max(0, fraction));
  const angle = Math.PI * (1 - f);
  return {
    x: round(GAUGE_CENTRE.x + GAUGE_RADIUS * Math.cos(angle)),
    y: round(GAUGE_CENTRE.y - GAUGE_RADIUS * Math.sin(angle)),
  };
}

export type RangeGaugeGeometry = {
  /** 0-1 filled. */
  fraction: number;
  /** stroke-dasharray for a path with pathLength="100". */
  dashArray: string;
  goal: { fraction: number; x: number; y: number } | null;
  start: { fraction: number; x: number; y: number } | null;
  /** The scale the dial was drawn on. */
  min: number;
  max: number;
};

/**
 * The dial for one joint range. The scale is `min` to `max` (a knee: 0 to a
 * little past the usual 135 so a goal at the usual end is not on the rim); a
 * reading outside it is drawn at the nearest end, never off the dial - the
 * number printed in the middle is the true one.
 */
export function rangeGaugeGeometry(input: {
  value: number;
  min?: number;
  max: number;
  goal?: number | null;
  start?: number | null;
}): RangeGaugeGeometry {
  const min = input.min ?? 0;
  const fraction = fractionOf(input.value, min, input.max);
  const marker = (v: number | null | undefined) => {
    if (v === null || v === undefined || !Number.isFinite(v)) return null;
    const f = fractionOf(v, min, input.max);
    return { fraction: round(f, 4), ...pointOnArc(f) };
  };
  return {
    fraction: round(fraction, 4),
    dashArray: `${round(fraction * 100)} 100`,
    goal: marker(input.goal),
    start: marker(input.start),
    min,
    max: input.max,
  };
}

export type SymmetryBarGeometry = {
  /** Fill width, percent of the bar. */
  fillPercent: number;
  /** Goal tick position, percent of the bar; null with no goal. */
  goalPercent: number | null;
  /** The scale's top, in the same unit as the reading. */
  scaleMax: number;
  reachedGoal: boolean | null;
};

/**
 * The limb-symmetry bar: the weaker leg as a percentage of the other leg.
 * The bar is drawn 0 to 100 unless the reading or the goal is higher (a leg
 * stronger than its partner, or a goal over 100), in which case the scale
 * grows to the next ten so nothing is clipped.
 */
export function symmetryBarGeometry(input: { percent: number; goal?: number | null }): SymmetryBarGeometry {
  const goal = input.goal !== null && input.goal !== undefined && Number.isFinite(input.goal) ? input.goal : null;
  const top = Math.max(100, input.percent, goal ?? 0);
  const scaleMax = Math.ceil(top / 10) * 10;
  const pct = (v: number) => round(Math.min(100, Math.max(0, (v / scaleMax) * 100)), 1);
  return {
    fillPercent: Number.isFinite(input.percent) ? pct(input.percent) : 0,
    goalPercent: goal === null ? null : pct(goal),
    scaleMax,
    reachedGoal: goal === null ? null : input.percent >= goal,
  };
}
