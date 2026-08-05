/**
 * Lateral-view spinal column geometry, drawn to read as a radiograph
 * rather than as a stack of blocks.
 *
 * Each vertebra is emitted as a set of sub-paths (body, neural arch,
 * articular processes, spinous process) which overlap into a single
 * silhouette. Drawing them separately keeps each path simple while still
 * producing an anatomically-shaped outline.
 *
 * Everything is computed deterministically at module load and quantised —
 * server and client evaluate the same trigonometry to results that can
 * differ in the last floating-point digit, which React reports as a
 * hydration mismatch on the generated path strings.
 */

export const VERTEBRA_COUNT = 24;

export const VIEWBOX = { width: 260, height: 760 } as const;

const CENTER_X = 130;
const TOP_Y = 46;
const BOTTOM_Y = 648;

/** Anterior is +x. Keyed by normalised position down the column. */
const CURVE_KEYS: ReadonlyArray<readonly [t: number, offset: number]> = [
  [0.0, 19],
  [0.16, 9],
  [0.45, -17],
  [0.72, -4],
  [0.88, 14],
  [1.0, 6],
];

function q(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function curveOffset(t: number): number {
  for (let i = 0; i < CURVE_KEYS.length - 1; i++) {
    const [t0, v0] = CURVE_KEYS[i];
    const [t1, v1] = CURVE_KEYS[i + 1];
    if (t <= t1) return v0 + (v1 - v0) * smootherstep(t0, t1, t);
  }
  return CURVE_KEYS[CURVE_KEYS.length - 1][1];
}

export type SpineRegion = "cervical" | "thoracic" | "lumbar";

export type Vertebra = {
  index: number;
  t: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  region: SpineRegion;
  /** Body, arch, superior/inferior facets, spinous blade. */
  paths: string[];
};

function regionFor(t: number): SpineRegion {
  if (t < 0.29) return "cervical";
  if (t < 0.71) return "thoracic";
  return "lumbar";
}

/**
 * Vertebral body: a rounded block whose anterior border is slightly
 * concave, which is what separates a real vertebra silhouette from a
 * rounded rectangle.
 */
function bodyPath(w: number, h: number): string {
  const ax = w / 2;
  const px = -w / 2;
  const top = -h / 2;
  const bot = h / 2;
  const r = h * 0.22;
  const waist = ax - h * 0.09;
  return [
    `M ${q(px + r)} ${q(top)}`,
    `L ${q(ax - r)} ${q(top)}`,
    `Q ${q(ax)} ${q(top)} ${q(ax)} ${q(top + r)}`,
    `Q ${q(waist)} 0 ${q(ax)} ${q(bot - r)}`,
    `Q ${q(ax)} ${q(bot)} ${q(ax - r)} ${q(bot)}`,
    `L ${q(px + r)} ${q(bot)}`,
    `Q ${q(px)} ${q(bot)} ${q(px)} ${q(bot - r * 0.6)}`,
    `L ${q(px)} ${q(top + r * 0.6)}`,
    `Q ${q(px)} ${q(top)} ${q(px + r)} ${q(top)}`,
    "Z",
  ].join(" ");
}

/** Pedicle + lamina bridging the body to the posterior elements. */
function archPath(w: number, h: number, arch: number): string {
  const px = -w / 2;
  return [
    `M ${q(px + 1)} ${q(-h * 0.24)}`,
    `L ${q(px - arch)} ${q(-h * 0.3)}`,
    `Q ${q(px - arch * 1.35)} 0 ${q(px - arch)} ${q(h * 0.3)}`,
    `L ${q(px + 1)} ${q(h * 0.24)}`,
    "Z",
  ].join(" ");
}

/** Superior and inferior articular processes — the facet joint column. */
function facetPath(w: number, h: number, arch: number, up: boolean): string {
  const px = -w / 2 - arch * 0.75;
  const dir = up ? -1 : 1;
  const reach = h * (up ? 0.62 : 0.66);
  const tipW = h * 0.2;
  return [
    `M ${q(px + tipW)} ${q(dir * h * 0.16)}`,
    `Q ${q(px + tipW * 0.4)} ${q(dir * reach)} ${q(px - tipW * 0.5)} ${q(dir * reach)}`,
    `Q ${q(px - tipW * 1.5)} ${q(dir * reach * 0.72)} ${q(px - tipW * 1.1)} ${q(dir * h * 0.16)}`,
    "Z",
  ].join(" ");
}

/** Spinous process — long and steeply raked in the thoracic spine. */
function spinousPath(w: number, h: number, arch: number, rake: number, len: number): string {
  const baseX = -w / 2 - arch * 0.9;
  const rad = (rake * Math.PI) / 180;
  const tipX = baseX - len * Math.cos(rad);
  const tipY = len * Math.sin(rad);
  const half = h * 0.19;
  const tipHalf = h * 0.17;
  return [
    `M ${q(baseX)} ${q(-half)}`,
    `Q ${q(baseX - len * 0.5)} ${q(tipY * 0.4 - half * 0.9)} ${q(tipX)} ${q(tipY - tipHalf)}`,
    `Q ${q(tipX - h * 0.12)} ${q(tipY)} ${q(tipX)} ${q(tipY + tipHalf)}`,
    `Q ${q(baseX - len * 0.5)} ${q(tipY * 0.4 + half * 1.1)} ${q(baseX)} ${q(half)}`,
    "Z",
  ].join(" ");
}

export const VERTEBRAE: Vertebra[] = Array.from({ length: VERTEBRA_COUNT }, (_, index) => {
  const t = q(index / (VERTEBRA_COUNT - 1));
  const x = q(CENTER_X + curveOffset(t));
  const y = q(lerp(TOP_Y, BOTTOM_Y, t));

  const dt = 0.012;
  const slope =
    (curveOffset(Math.min(1, t + dt)) - curveOffset(Math.max(0, t - dt))) / (2 * dt);
  const rotation = q(Math.atan2(slope, BOTTOM_Y - TOP_Y) * (180 / Math.PI) * 0.6);

  const region = regionFor(t);
  const width = q(lerp(30, 62, smootherstep(0, 0.92, t)));
  const height = q(lerp(17, 25, smootherstep(0, 0.92, t)));
  const arch = q(width * 0.2);

  // Thoracic spinous processes are the long, steeply-angled ones that give
  // the mid-back its shingled look; cervical and lumbar are shorter and flatter.
  const rake =
    region === "thoracic" ? lerp(24, 52, smootherstep(0.29, 0.6, t)) : region === "lumbar" ? 8 : 14;
  const spineLen =
    region === "thoracic"
      ? width * lerp(0.78, 0.95, smootherstep(0.29, 0.62, t))
      : width * (region === "lumbar" ? 0.46 : 0.44);

  return {
    index,
    t,
    x,
    y,
    width,
    height,
    rotation,
    region,
    paths: [
      bodyPath(width, height),
      archPath(width, height, arch),
      facetPath(width, height, arch, true),
      facetPath(width, height, arch, false),
      spinousPath(width, height, arch, rake, spineLen),
    ],
  };
});

/** Intervertebral discs, drawn as the darker gaps between bodies. */
export const DISCS = VERTEBRAE.slice(0, -1).map((a, i) => {
  const b = VERTEBRAE[i + 1];
  return {
    key: a.index,
    t: q((a.t + b.t) / 2),
    cx: q((a.x + b.x) / 2),
    cy: q((a.y + b.y) / 2),
    rx: q(((a.width + b.width) / 2) * 0.34),
    ry: q(((b.y - a.y) - (a.height + b.height) / 2) * 0.5 + 1.6),
  };
});

/** Sacrum, anchoring the base of the column. */
export const SACRUM = (() => {
  const last = VERTEBRAE[VERTEBRA_COUNT - 1];
  const w = last.width * 1.02;
  const top = q(last.y + last.height * 0.62);
  return {
    path: [
      `M ${q(last.x - w / 2)} ${q(top)}`,
      `L ${q(last.x + w / 2)} ${q(top)}`,
      `Q ${q(last.x + w * 0.36)} ${q(top + 46)} ${q(last.x + w * 0.1)} ${q(top + 72)}`,
      `Q ${q(last.x - w * 0.08)} ${q(top + 86)} ${q(last.x - w * 0.26)} ${q(top + 70)}`,
      `Q ${q(last.x - w * 0.42)} ${q(top + 40)} ${q(last.x - w / 2)} ${q(top)}`,
      "Z",
    ].join(" "),
    top,
  };
})();

export const SPINE_REGIONS: ReadonlyArray<{
  id: SpineRegion;
  label: string;
  range: readonly [number, number];
}> = [
  { id: "cervical", label: "Cervical", range: [0, 0.29] },
  { id: "thoracic", label: "Thoracic", range: [0.29, 0.71] },
  { id: "lumbar", label: "Lumbar", range: [0.71, 1] },
];
