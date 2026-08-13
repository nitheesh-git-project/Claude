"use client";

import { PAIN_MAP_REGIONS, painBand, type PainMapRegionKey, type PainMapSide } from "@/lib/painMap";

const PAIN_DOT_COLOR: Record<string, string> = {
  low: "#10b981", // emerald-500
  mid: "#d97706", // amber-600
  high: "#dc2626", // red-600
};

type LatestAssessment = { pain_percent: number; created_at: string };

// Front/back jointed body figure (the same construction as the published
// design-pass artifact — a lay figure, not a muscle chart, so every ball
// joint is already a clinical landmark). Renders every region as a tap
// target: colored + filled when assessed, a hollow ring when not.
//
// interactive=true (therapist filling an assessment) makes dots clickable
// and calls onSelect(region, side) — side is implied by which dot was
// tapped, so this replaces a manual side dropdown entirely. Otherwise
// (patient/admin viewing) dots are inert except for onSelect being used to
// drive a read-only detail panel below the diagram.
export default function BodyMapDiagram({
  latestByKey,
  includedKeys,
  selected,
  interactive = false,
  onSelect,
}: {
  latestByKey: Map<string, LatestAssessment>;
  // Picker mode (AreaPainPicker): dots whose "region:side" key is in this
  // set render filled in accent teal regardless of latestByKey -- there's
  // no severity color to show yet in that context, only inclusion.
  includedKeys?: Set<string>;
  selected?: { region: PainMapRegionKey; side: PainMapSide } | null;
  interactive?: boolean;
  // `rect` is the tapped dot's own on-screen bounding box (from the click
  // event's target) -- callers that want a popup anchored at the tap
  // point (PainMapView) use it directly instead of re-deriving SVG-to-
  // screen coordinates themselves; callers that don't (picker/fill modes)
  // just ignore the third argument.
  onSelect?: (region: PainMapRegionKey, side: PainMapSide, rect: DOMRect) => void;
}) {
  const backRegions = PAIN_MAP_REGIONS.filter((r) => r.view === "back");
  const frontRegions = PAIN_MAP_REGIONS.filter((r) => r.view === "front");

  function renderDot(region: (typeof PAIN_MAP_REGIONS)[number], side: PainMapSide, cx: number, cy: number) {
    const key = `${region.key}:${side}`;
    const latest = latestByKey.get(key);
    const isIncluded = includedKeys?.has(key);
    const isSelected = selected?.region === region.key && selected?.side === side;
    const fill = isIncluded ? "#0d9488" : latest ? PAIN_DOT_COLOR[painBand(latest.pain_percent)] : "none";
    const clickable = interactive || !!latest;

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
        {isSelected && <circle cx={cx} cy={cy} r={12} fill="none" stroke="#0d9488" strokeWidth={2} />}
        <circle cx={cx} cy={cy} r={7} fill={fill} stroke="#64748b" strokeWidth={fill === "none" ? 1.6 : 0} />
        {clickable && <circle cx={cx} cy={cy} r={13} fill="transparent" />}
      </g>
    );
  }

  function renderFigure(regions: typeof backRegions, cx: number, label: string) {
    return (
      <g>
        {/* limbs */}
        <line x1={cx - 64} y1={128} x2={cx - 74} y2={230} stroke="#cbd5e1" strokeWidth={22} strokeLinecap="round" />
        <line x1={cx - 74} y1={230} x2={cx - 80} y2={320} stroke="#cbd5e1" strokeWidth={18} strokeLinecap="round" />
        <ellipse cx={cx - 80} cy={336} rx={11} ry={16} fill="#cbd5e1" />
        <line x1={cx + 64} y1={128} x2={cx + 74} y2={230} stroke="#cbd5e1" strokeWidth={22} strokeLinecap="round" />
        <line x1={cx + 74} y1={230} x2={cx + 80} y2={320} stroke="#cbd5e1" strokeWidth={18} strokeLinecap="round" />
        <ellipse cx={cx + 80} cy={336} rx={11} ry={16} fill="#cbd5e1" />
        <line x1={cx - 52} y1={273} x2={cx - 46} y2={420} stroke="#cbd5e1" strokeWidth={26} strokeLinecap="round" />
        <line x1={cx - 46} y1={420} x2={cx - 40} y2={560} stroke="#cbd5e1" strokeWidth={20} strokeLinecap="round" />
        <ellipse cx={cx - 40} cy={572} rx={16} ry={9} fill="#cbd5e1" />
        <line x1={cx + 52} y1={273} x2={cx + 46} y2={420} stroke="#cbd5e1" strokeWidth={26} strokeLinecap="round" />
        <line x1={cx + 46} y1={420} x2={cx + 40} y2={560} stroke="#cbd5e1" strokeWidth={20} strokeLinecap="round" />
        <ellipse cx={cx + 40} cy={572} rx={16} ry={9} fill="#cbd5e1" />

        {/* torso */}
        <polygon
          points={`${cx - 64},124 ${cx + 64},124 ${cx + 42},230 ${cx + 52},270 ${cx - 52},270 ${cx - 42},230`}
          fill="#cbd5e1"
        />
        <line x1={cx} y1={100} x2={cx} y2={124} stroke="#cbd5e1" strokeWidth={22} strokeLinecap="round" />
        <circle cx={cx} cy={70} r={32} fill="#cbd5e1" />

        <text x={cx} y={612} textAnchor="middle" fontSize={12} fill="#94a3b8" letterSpacing={1}>
          {label}
        </text>

        {regions.map((region) => {
          const coords = REGION_COORDS[region.key];
          if (region.paired) {
            return (
              <g key={region.key}>
                {renderDot(region, "left", cx - coords.dx, coords.dy)}
                {renderDot(region, "right", cx + coords.dx, coords.dy)}
              </g>
            );
          }
          return renderDot(region, "na", cx, coords.dy);
        })}
      </g>
    );
  }

  return (
    <svg
      viewBox="0 0 900 640"
      role="img"
      aria-label="Front and back body diagram with tap points for each clinical region, colored by pain severity"
      className="w-full max-w-lg mx-auto"
    >
      {renderFigure(backRegions, 230, "BACK")}
      {renderFigure(frontRegions, 670, "FRONT")}
    </svg>
  );
}

// dx = distance from the figure's centerline (mirrored for paired
// regions); dy = absolute y. Matches the published design-pass artifact's
// skeleton exactly, driven from data instead of one-off hardcoding.
const REGION_COORDS: Record<PainMapRegionKey, { dx: number; dy: number }> = {
  neck: { dx: 0, dy: 112 },
  upper_back: { dx: 0, dy: 165 },
  triceps: { dx: 69, dy: 179 },
  lower_back: { dx: 0, dy: 250 },
  glutes: { dx: 0, dy: 268 },
  hamstrings: { dx: 49, dy: 346 },
  calves: { dx: 43, dy: 490 },
  shoulder: { dx: 64, dy: 128 },
  chest: { dx: 0, dy: 170 },
  biceps: { dx: 69, dy: 179 },
  elbow: { dx: 74, dy: 230 },
  abs_core: { dx: 0, dy: 225 },
  wrist_hand: { dx: 80, dy: 328 },
  hip: { dx: 52, dy: 273 },
  quads: { dx: 49, dy: 346 },
  knee: { dx: 46, dy: 420 },
  ankle_foot: { dx: 40, dy: 566 },
};
