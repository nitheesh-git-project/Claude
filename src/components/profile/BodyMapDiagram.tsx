"use client";

import { useId } from "react";
import { PAIN_MAP_REGIONS, painBand, type PainMapRegionKey, type PainMapSide } from "@/lib/painMap";

const PAIN_DOT_COLOR: Record<string, string> = {
  low: "#10b981", // emerald-500
  mid: "#d97706", // amber-600
  high: "#dc2626", // red-600
};

type LatestAssessment = { pain_percent: number; created_at: string };

/** One cross-section of a limb or torso: `x` is the offset from the
 *  figure's centerline (negative = the figure's left), `y` is absolute,
 *  `w` is the half-width of the body at that height. A list of these is
 *  all it takes to describe a tapering human shape. */
type BodyNode = { x: number; y: number; w: number };

/**
 * Turns a run of cross-sections into one closed, smooth silhouette:
 * down the left edge, round the bottom, back up the right edge, round
 * the top. Curvature comes from cubic segments whose control points sit
 * at the vertical midpoint between two nodes, which is what gives a
 * thigh its taper and a shoulder its roll instead of the straight
 * stroked lines this diagram used to be drawn with.
 */
function silhouettePath(
  nodes: BodyNode[],
  // How far past the first/last cross-section the rounded caps reach, as
  // a multiple of that section's half-width. A limb wants a near-circular
  // cap (a hand, a foot); a torso wants a shallow one, or the pelvis
  // balloons out below the hips into a shape no body has.
  { topCap = 0.55, bottomCap = 0.95 }: { topCap?: number; bottomCap?: number } = {}
): string {
  const left = nodes.map((n) => ({ x: n.x - n.w, y: n.y }));
  const right = nodes.map((n) => ({ x: n.x + n.w, y: n.y })).reverse();
  const first = nodes[0];
  const last = nodes[nodes.length - 1];

  const curveThrough = (points: { x: number; y: number }[]) =>
    points
      .slice(1)
      .map((p, i) => {
        const prev = points[i];
        const midY = (prev.y + p.y) / 2;
        return `C ${prev.x} ${midY} ${p.x} ${midY} ${p.x} ${p.y}`;
      })
      .join(" ");

  return [
    `M ${left[0].x} ${left[0].y}`,
    curveThrough(left),
    // Rounded cap across the bottom, then back up the far edge.
    `Q ${last.x - last.w} ${last.y + last.w * bottomCap} ${last.x} ${last.y + last.w * bottomCap}`,
    `Q ${last.x + last.w} ${last.y + last.w * bottomCap} ${right[0].x} ${right[0].y}`,
    curveThrough(right),
    `Q ${first.x + first.w} ${first.y - first.w * topCap} ${first.x} ${first.y - first.w * topCap}`,
    `Q ${first.x - first.w} ${first.y - first.w * topCap} ${left[0].x} ${left[0].y}`,
    "Z",
  ].join(" ");
}

// Every measurement below is in the figure's own space: x as an offset
// from its centerline, y from the top of the head. Both figures are the
// same anatomy — a back view of a body is the same outline as its front
// — so one set of parts draws both, and only the surface detail (spine
// and shoulder blades vs. collarbone and midline) differs.
const HEAD = { cy: 60, rx: 27, ry: 34 };

const TORSO: BodyNode[] = [
  { x: 0, y: 104, w: 32 }, // base of the neck
  { x: 0, y: 132, w: 70 }, // deltoids
  { x: 0, y: 170, w: 60 }, // chest / upper back
  { x: 0, y: 205, w: 52 }, // ribcage narrowing
  { x: 0, y: 240, w: 47 }, // waist
  { x: 0, y: 274, w: 55 }, // iliac crest
  { x: 0, y: 296, w: 50 }, // hips, tapering into the thighs
];

const NECK: BodyNode[] = [
  { x: 0, y: 86, w: 17 },
  { x: 0, y: 110, w: 21 },
];

const ARM: BodyNode[] = [
  { x: 60, y: 134, w: 20 }, // deltoid
  { x: 72, y: 182, w: 17 }, // biceps / triceps
  { x: 83, y: 233, w: 13 }, // elbow
  { x: 92, y: 285, w: 11 }, // forearm
  { x: 97, y: 320, w: 10 }, // wrist
];

const HAND: BodyNode[] = [
  { x: 98, y: 326, w: 11 },
  { x: 100, y: 348, w: 9 },
];

const LEG: BodyNode[] = [
  { x: 30, y: 286, w: 23 }, // upper thigh, tucked under the pelvis
  { x: 32, y: 340, w: 25 }, // mid thigh
  { x: 35, y: 420, w: 18 }, // knee
  { x: 38, y: 465, w: 20 }, // calf belly
  { x: 40, y: 525, w: 13 }, // shin
  { x: 41, y: 558, w: 11 }, // ankle
];

// dx = distance from the figure's centerline (mirrored for paired
// regions); dy = absolute y. Each point sits on the anatomy it names, so
// tapping the diagram reads as tapping your own body.
const REGION_COORDS: Record<PainMapRegionKey, { dx: number; dy: number }> = {
  neck: { dx: 0, dy: 98 },
  upper_back: { dx: 0, dy: 162 },
  triceps: { dx: 70, dy: 192 },
  // lower_back/glutes used to sit close enough together that taps near
  // the boundary landed on whichever region painted last; the 17-unit
  // tap radius on each needs roughly 40 units of separation to be safe.
  lower_back: { dx: 0, dy: 236 },
  glutes: { dx: 0, dy: 288 },
  hamstrings: { dx: 32, dy: 360 },
  calves: { dx: 38, dy: 468 },
  shoulder: { dx: 58, dy: 139 },
  chest: { dx: 0, dy: 170 },
  biceps: { dx: 70, dy: 192 },
  elbow: { dx: 83, dy: 234 },
  abs_core: { dx: 0, dy: 236 },
  wrist_hand: { dx: 97, dy: 324 },
  hip: { dx: 40, dy: 290 },
  quads: { dx: 32, dy: 360 },
  knee: { dx: 35, dy: 420 },
  ankle_foot: { dx: 41, dy: 560 },
};

/**
 * Front/back human figure with a tap target on each of the 17 clinical
 * regions: colored + filled when assessed, a hollow ring when not, and a
 * soft heat glow behind the assessed ones so severity reads from across
 * the room before any number is.
 *
 * The figure is an anatomical silhouette rather than the stick-and-joint
 * lay figure this started as — patients look at this to find *their own*
 * shoulder, and a shape that reads as a body is what makes "tap where it
 * hurts" an obvious instruction instead of a puzzle.
 *
 * interactive=true (therapist filling an assessment, patient picking
 * their own painful areas) makes dots clickable and calls onSelect(region,
 * side) — side is implied by which dot was tapped, so this replaces a
 * manual side dropdown entirely. Otherwise (patient/admin viewing) dots
 * are inert except for onSelect being used to drive a read-only detail
 * panel beside the diagram.
 */
export default function BodyMapDiagram({
  latestByKey,
  includedKeys,
  secondaryByKey,
  selected,
  interactive = false,
  onSelect,
}: {
  latestByKey: Map<string, LatestAssessment>;
  // Picker mode (AreaPainPicker): dots whose "region:side" key is in this
  // set render filled in accent teal regardless of latestByKey -- there's
  // no severity color to show yet in that context, only inclusion.
  includedKeys?: Set<string>;
  // Comparison mode (PainComparisonView): a second data source (patient's
  // own self-reported 0-10 per area) drawn as a blue outer ring around the
  // existing dot, so both datasets are visible on one figure at once
  // without needing two separate diagrams.
  secondaryByKey?: Map<string, number>;
  selected?: { region: PainMapRegionKey; side: PainMapSide } | null;
  interactive?: boolean;
  // `rect` is the tapped dot's own on-screen bounding box (from the click
  // event's target) -- callers that want a popup anchored at the tap
  // point (PainMapView) use it directly instead of re-deriving SVG-to-
  // screen coordinates themselves; callers that don't (picker/fill modes)
  // just ignore the third argument.
  onSelect?: (region: PainMapRegionKey, side: PainMapSide, rect: DOMRect) => void;
}) {
  // Gradient/filter ids must be unique per mounted diagram: two of these
  // on one page (the map and the comparison view) would otherwise both
  // resolve to whichever definition rendered first.
  const uid = useId().replace(/:/g, "");

  const backRegions = PAIN_MAP_REGIONS.filter((r) => r.view === "back");
  const frontRegions = PAIN_MAP_REGIONS.filter((r) => r.view === "front");

  const skinId = (view: "front" | "back") => `${uid}-skin-${view}`;
  const glowId = (view: "front" | "back") => `${uid}-glow-${view}`;

  function renderDot(
    region: (typeof PAIN_MAP_REGIONS)[number],
    side: PainMapSide,
    cx: number,
    cy: number,
    view: "front" | "back"
  ) {
    const key = `${region.key}:${side}`;
    const latest = latestByKey.get(key);
    const hasSecondary = secondaryByKey?.has(key);
    const isIncluded = includedKeys?.has(key);
    const isSelected = selected?.region === region.key && selected?.side === side;
    const band = latest ? painBand(latest.pain_percent) : null;
    const fill = isIncluded ? "#0d9488" : band ? PAIN_DOT_COLOR[band] : "none";
    const clickable = interactive || !!latest || hasSecondary;

    return (
      <g
        key={key}
        onClick={
          clickable && onSelect
            ? (e) => onSelect(region.key, side, e.currentTarget.getBoundingClientRect())
            : undefined
        }
        style={clickable ? { cursor: "pointer" } : undefined}
      >
        {/* Heat behind the dot, sized by how bad it is -- the shape of a
            patient's pain is visible before a single label is read. */}
        {(band || isIncluded) && (
          <circle
            cx={cx}
            cy={cy}
            r={band ? 16 + (latest!.pain_percent / 100) * 18 : 20}
            fill={isIncluded ? "#0d9488" : PAIN_DOT_COLOR[band!]}
            opacity={0.22}
            filter={`url(#${glowId(view)})`}
          />
        )}
        {isSelected && <circle cx={cx} cy={cy} r={13} fill="none" stroke="#0f766e" strokeWidth={2.5} />}
        {hasSecondary && <circle cx={cx} cy={cy} r={11} fill="none" stroke="#2563eb" strokeWidth={2} />}
        <circle
          cx={cx}
          cy={cy}
          r={7}
          fill={fill === "none" ? "#ffffff" : fill}
          fillOpacity={fill === "none" ? 0.55 : 1}
          stroke={fill === "none" ? "#94a3b8" : "#ffffff"}
          strokeWidth={fill === "none" ? 1.6 : 2}
        />
        {/* Larger invisible target than the visible dot -- easier to tap
            accurately on a small/scaled-down mobile screen. */}
        {clickable && <circle cx={cx} cy={cy} r={17} fill="transparent" />}
      </g>
    );
  }

  function renderFigure(regions: typeof backRegions, cx: number, view: "front" | "back", label: string) {
    const mirror = (nodes: BodyNode[]) => nodes.map((n) => ({ ...n, x: -n.x }));
    const shift = (nodes: BodyNode[]) => nodes.map((n) => ({ ...n, x: n.x + cx }));

    return (
      <g>
        <g fill={`url(#${skinId(view)})`}>
          <path d={silhouettePath(shift(ARM), { topCap: 0.7, bottomCap: 0.4 })} />
          <path d={silhouettePath(shift(mirror(ARM)), { topCap: 0.7, bottomCap: 0.4 })} />
          <path d={silhouettePath(shift(HAND), { topCap: 0.3, bottomCap: 1.1 })} />
          <path d={silhouettePath(shift(mirror(HAND)), { topCap: 0.3, bottomCap: 1.1 })} />
          <path d={silhouettePath(shift(LEG), { topCap: 0.2, bottomCap: 0.5 })} />
          <path d={silhouettePath(shift(mirror(LEG)), { topCap: 0.2, bottomCap: 0.5 })} />
          <path d={silhouettePath(shift(NECK), { topCap: 0.2, bottomCap: 0.2 })} />
          <path d={silhouettePath(shift(TORSO), { topCap: 0.25, bottomCap: 0.3 })} />
          <ellipse cx={cx} cy={HEAD.cy} rx={HEAD.rx} ry={HEAD.ry} />
          {/* Feet read as feet only if they point somewhere: front view
              splays them outward, back view tucks the heels in. */}
          <ellipse
            cx={cx - 41}
            cy={view === "front" ? 574 : 572}
            rx={13}
            ry={view === "front" ? 17 : 12}
            transform={`rotate(${view === "front" ? -12 : 8} ${cx - 41} 576)`}
          />
          <ellipse
            cx={cx + 41}
            cy={view === "front" ? 574 : 572}
            rx={13}
            ry={view === "front" ? 17 : 12}
            transform={`rotate(${view === "front" ? 12 : -8} ${cx + 41} 576)`}
          />
        </g>

        {/* Surface detail: enough to tell the two views apart at a glance
            without turning a body map into an anatomy chart. */}
        <g fill="none" stroke="#94a3b8" strokeOpacity={0.45} strokeLinecap="round">
          {view === "front" ? (
            <>
              <path d={`M ${cx - 40} 140 Q ${cx} 156 ${cx + 40} 140`} strokeWidth={1.6} />
              <path d={`M ${cx} 178 L ${cx} 258`} strokeWidth={1.2} />
              <path d={`M ${cx - 26} 214 Q ${cx} 220 ${cx + 26} 214`} strokeWidth={1.1} />
              <path d={`M ${cx - 24} 238 Q ${cx} 244 ${cx + 24} 238`} strokeWidth={1.1} />
              <path d={`M ${cx - 30} 300 Q ${cx} 316 ${cx + 30} 300`} strokeWidth={1.4} />
            </>
          ) : (
            <>
              <path d={`M ${cx} 112 L ${cx} 285`} strokeWidth={1.5} />
              <path d={`M ${cx - 44} 150 Q ${cx - 26} 178 ${cx - 12} 158`} strokeWidth={1.3} />
              <path d={`M ${cx + 44} 150 Q ${cx + 26} 178 ${cx + 12} 158`} strokeWidth={1.3} />
              <path d={`M ${cx - 34} 300 Q ${cx} 292 ${cx + 34} 300`} strokeWidth={1.3} />
              <path d={`M ${cx - 30} 460 Q ${cx - 18} 470 ${cx - 30} 486`} strokeWidth={1.1} />
              <path d={`M ${cx + 30} 460 Q ${cx + 18} 470 ${cx + 30} 486`} strokeWidth={1.1} />
            </>
          )}
        </g>

        <text
          x={cx}
          y={620}
          textAnchor="middle"
          fontSize={12}
          fontWeight={600}
          fill="#94a3b8"
          letterSpacing={1.5}
        >
          {label}
        </text>

        {regions.map((region) => {
          const coords = REGION_COORDS[region.key];
          if (region.paired) {
            return (
              <g key={region.key}>
                {renderDot(region, "left", cx - coords.dx, coords.dy, view)}
                {renderDot(region, "right", cx + coords.dx, coords.dy, view)}
              </g>
            );
          }
          return renderDot(region, "na", cx, coords.dy, view);
        })}
      </g>
    );
  }

  // One <svg> per view rather than both figures in a single wide one:
  // side by side on a laptop, stacked on a phone, where two figures
  // sharing 350px of width shrink each tap target to about 6px -- far
  // under a fingertip. Stacked, each figure gets the full column and the
  // dots stay tappable.
  const figure = (view: "front" | "back") => (
    <svg
      key={view}
      viewBox="0 0 460 645"
      role="img"
      aria-label={`${view === "front" ? "Front" : "Back"} body diagram with tap points for each clinical region, colored by pain severity`}
      className="w-full max-w-[17rem] sm:max-w-none sm:flex-1"
    >
      <defs>
        <linearGradient id={skinId(view)} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e7edf3" />
          <stop offset="45%" stopColor="#d6dfe9" />
          <stop offset="100%" stopColor="#bcc8d6" />
        </linearGradient>
        <filter id={glowId(view)} x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      {renderFigure(view === "back" ? backRegions : frontRegions, 230, view, view.toUpperCase())}
    </svg>
  );

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-2">
      {figure("back")}
      {figure("front")}
    </div>
  );
}
