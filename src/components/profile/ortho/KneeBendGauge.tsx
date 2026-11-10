import { GAUGE_ARC_PATH, GAUGE_CENTRE, GAUGE_VIEWBOX, rangeGaugeGeometry } from "@/lib/rangeGauge";

/**
 * The knee-bend half-dial: how far the knee bends now against where it
 * started and the goal. A thin drawing over `rangeGaugeGeometry`; the
 * number in the middle is the true reading even when the dial clamps it.
 * Colours are the `--chart-*` tokens so it reads in dark mode, and the
 * words are in the caption and `aria-label`, so the colour is never the
 * only signal.
 */
export default function KneeBendGauge({
  title,
  value,
  start = null,
  goal = null,
  goalReached = false,
  max = 150,
  caption,
}: {
  title: string;
  value: number;
  start?: number | null;
  goal?: number | null;
  goalReached?: boolean;
  /** The dial's top: a little past the usual range so a goal at the usual end is not on the rim. */
  max?: number;
  caption?: string;
}) {
  const g = rangeGaugeGeometry({ value, max, goal, start });
  const label = `${title}: ${value} degrees${start !== null ? `, started at ${start}` : ""}${goal !== null ? `, goal ${goal}${goalReached ? " (reached)" : ""}` : ""}.`;
  return (
    <figure className="m-0 flex min-w-0 flex-col items-center gap-1 rounded-xl border border-slate-200 p-3.5">
      <figcaption className="self-start text-sm font-semibold text-slate-900">{title}</figcaption>
      <svg viewBox={`0 0 ${GAUGE_VIEWBOX.width} ${GAUGE_VIEWBOX.height}`} role="img" aria-label={label} className="w-full max-w-[200px]">
        <path d={GAUGE_ARC_PATH} fill="none" stroke="var(--chart-grid)" strokeWidth="10" strokeLinecap="round" pathLength="100" />
        <path
          d={GAUGE_ARC_PATH}
          fill="none"
          stroke="var(--chart-brand)"
          strokeWidth="10"
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray={g.dashArray}
        />
        {g.start && <circle cx={g.start.x} cy={g.start.y} r="2.5" fill="var(--chart-neutral)" />}
        {g.goal && <circle cx={g.goal.x} cy={g.goal.y} r="4" fill="#ffffff" stroke="var(--chart-good)" strokeWidth="2.5" />}
        <text x={GAUGE_CENTRE.x} y="56" textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--chart-ink)">
          {value}°
        </text>
      </svg>
      <p className="text-center text-xs text-slate-700">
        {caption ??
          [start !== null ? `Started at ${start}°` : null, goal !== null ? `goal ${goal}°${goalReached ? " (reached)" : ""}` : null]
            .filter(Boolean)
            .join(" - ")}
      </p>
    </figure>
  );
}
