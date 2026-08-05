/**
 * Lateral-view spinal column geometry.
 *
 * Positions are computed deterministically at module load (no randomness,
 * no Date/window access) so the server and client render byte-identical
 * SVG and React doesn't throw a hydration mismatch.
 *
 * The silhouette follows the real sagittal curve — cervical lordosis,
 * thoracic kyphosis, lumbar lordosis — because a straight stack of blocks
 * reads as "abstract decoration" rather than "this clinic treats spines".
 */

// Stylised rather than literal: 18 clearly-readable bodies communicate
// "spine" at display size far better than an anatomically-exact 24 that
// degrade into tick marks.
export const VERTEBRA_COUNT = 18;

export const VIEWBOX = { width: 200, height: 700 } as const;

const CENTER_X = 100;
const TOP_Y = 40;
const BOTTOM_Y = 630;

// Horizontal offset from the vertical axis, keyed by normalised position
// down the column (0 = C1 at the skull, 1 = sacrum). Anterior is +x.
const CURVE_KEYS: ReadonlyArray<readonly [t: number, offset: number]> = [
  [0.0, 27],
  [0.16, 13],
  [0.45, -26],
  [0.72, -4],
  [0.88, 22],
  [1.0, 9],
];

/**
 * Server and client evaluate the same trigonometry to results that can
 * differ in the last floating-point digit, which React reports as a
 * hydration mismatch on the generated path strings. Quantising every
 * derived coordinate removes the drift entirely.
 */
function q(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function curveOffset(t: number): number {
  for (let i = 0; i < CURVE_KEYS.length - 1; i++) {
    const [t0, v0] = CURVE_KEYS[i];
    const [t1, v1] = CURVE_KEYS[i + 1];
    if (t <= t1) {
      return v0 + (v1 - v0) * smootherstep(t0, t1, t);
    }
  }
  return CURVE_KEYS[CURVE_KEYS.length - 1][1];
}

export type SpineRegion = "cervical" | "thoracic" | "lumbar";

export type Vertebra = {
  index: number;
  /** Normalised position down the column, 0 (skull) to 1 (sacrum). */
  t: number;
  x: number;
  y: number;
  /** Vertebral body width — cervical are small, lumbar carry load and are broad. */
  width: number;
  height: number;
  /** Tilt following the local tangent of the curve, in degrees. */
  rotation: number;
  /** Downward rake of the spinous process; steepest through the thoracic spine. */
  processAngle: number;
  region: SpineRegion;
};

function regionFor(t: number): SpineRegion {
  if (t < 0.28) return "cervical";
  if (t < 0.7) return "thoracic";
  return "lumbar";
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export const VERTEBRAE: Vertebra[] = Array.from({ length: VERTEBRA_COUNT }, (_, index) => {
  const t = q(index / (VERTEBRA_COUNT - 1));
  const x = q(CENTER_X + curveOffset(t));
  const y = q(lerp(TOP_Y, BOTTOM_Y, t));

  // Tangent of the curve, used to tilt each body so the stack flows along
  // the curve instead of every block sitting perfectly level.
  const dt = 0.012;
  const slope = (curveOffset(Math.min(1, t + dt)) - curveOffset(Math.max(0, t - dt))) / (2 * dt);
  const rotation = q(Math.atan2(slope, BOTTOM_Y - TOP_Y) * (180 / Math.PI) * 1.15);

  const region = regionFor(t);
  const width = q(lerp(38, 70, smootherstep(0, 0.92, t)));
  const height = q(lerp(19, 26, smootherstep(0, 0.92, t)));
  const processAngle = q(
    region === "thoracic" ? lerp(18, 42, smootherstep(0.28, 0.62, t)) : 12
  );

  return { index, t, x, y, width, height, rotation, processAngle, region };
});

/** Narrative bands used by the home page's scroll story. */
export const SPINE_REGIONS: ReadonlyArray<{
  id: SpineRegion;
  label: string;
  range: readonly [number, number];
}> = [
  { id: "cervical", label: "Cervical", range: [0, 0.28] },
  { id: "thoracic", label: "Thoracic", range: [0.28, 0.7] },
  { id: "lumbar", label: "Lumbar", range: [0.7, 1] },
];
