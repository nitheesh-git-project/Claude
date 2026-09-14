"use client";

import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/dashboard/SurfaceCard";

// The admin dashboard's charts, in one place.
//
// They were written inside AdminMetricsTab and were private to it, so the
// Business Health screen had the choice of importing a 1,700-line screen or
// drawing its own -- and a second set of charts is a second set of colours, a
// second empty state and a second answer to "what does a gap in this line
// mean". They are lifted here unchanged in behaviour; only their home moved.
//
// Plain SVG rather than a charting library, which is the existing decision and
// worth keeping: the admin dashboard already ships every screen at once, and
// a charting bundle on a page that renders forty queries' worth of markup is
// weight every admin downloads whether or not they open this screen.

/** Single sequential hue for a one-series chart: one bar colour means
 *  magnitude only, never identity, so no legend is needed and the card's own
 *  title names the series. */
export const CHART_COLOR = "#0f766e"; // teal-700

// A four-series palette, distinct in lightness as well as hue so it survives
// colourblindness and a black-and-white print of an exported table.
//
// The teal and the amber are a shade darker than the -600 pair they started
// as, and that is a contrast rule rather than a taste: both are printed as
// *text* as well as drawn (the conversion figure on Delivery, the partners'
// share on Summary), and teal-600 on white is 3.7:1 -- enough for a bar,
// short of AA for a number somebody has to read. Swapping one back for a
// brighter line would quietly fail the figure beside it.
export const REVENUE_COLOR = "#0f172a"; // slate-900 - the top line
export const THERAPIST_CUT_COLOR = "#4f46e5"; // indigo-600
export const HOSPITAL_CUT_COLOR = "#b45309"; // amber-700
export const PROFIT_COLOR = "#0f766e"; // teal-700
export const COST_COLOR = "#be123c"; // rose-700 - money going out
export const NEUTRAL_COLOR = "#475569"; // slate-600

/** Axis tick labels. slate-500 rather than the slate-400 these started at:
 *  they are read, not decoration, and slate-400 on white is 2.63:1 -- the
 *  same failure the app-wide sweep corrected in every other place a label
 *  sits on a white card. */
const AXIS_LABEL_COLOR = "#64748b"; // slate-500

export type ChartBucket = { label: string; startMs: number; endMs: number };

/**
 * Measures its container's real rendered width after mount, so a chart fills
 * exactly the space it is given at any screen size.
 *
 * Deliberately not an SVG viewBox stretch: that scales text and stroke widths
 * non-uniformly whenever the container's aspect ratio differs from the
 * viewBox's, which visibly squashes labels. The default width is what the
 * server-rendered HTML shows before this runs -- an effect never fires during
 * SSR, so hydration always matches and the real width arrives in a later
 * commit rather than in a mismatched first one.
 */
export function useContainerWidth(defaultWidth: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(defaultWidth);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

function NoData() {
  return (
    <EmptyState
      icon="fa-chart-column"
      title="No data in this range"
      body="Widen the date range or clear a filter - nothing was delivered in the window you picked."
    />
  );
}

export function TrendBarChart({
  buckets,
  values,
  formatValue,
  color = CHART_COLOR,
  ariaLabel = "Trend chart",
}: {
  buckets: ChartBucket[];
  values: number[];
  formatValue: (v: number) => string;
  color?: string;
  ariaLabel?: string;
}) {
  const { ref, width } = useContainerWidth(640);

  if (buckets.length === 0 || values.every((v) => v === 0)) return <NoData />;

  const chartHeight = 150;
  const labelSpace = 24;
  const slotWidth = width / buckets.length;
  const barWidth = Math.max(Math.min(slotWidth * 0.55, 48), 4);
  // Negative values are real here -- a month can lose money -- so the axis has
  // to be able to sit above the floor rather than at it.
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const zeroY = ((max - 0) / span) * (chartHeight - 24) + 12;

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={chartHeight + labelSpace} role="img" aria-label={ariaLabel}>
        <line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke="#e2e8f0" strokeWidth={1} />
        {buckets.map((b, i) => {
          const value = values[i] ?? 0;
          const h = (Math.abs(value) / span) * (chartHeight - 24);
          const x = i * slotWidth + (slotWidth - barWidth) / 2;
          const y = value >= 0 ? zeroY - h : zeroY;
          return (
            <g key={b.label + i}>
              {/* One interpolated string, not three children: with multiple
                  children suppressHydrationWarning silences the warning but
                  React still discards and re-renders the subtree, which is a
                  visible flash. */}
              <title suppressHydrationWarning>{`${b.label}: ${formatValue(value)}`}</title>
              {h > 0 && (
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={h}
                  fill={value >= 0 ? color : COST_COLOR}
                  rx={3}
                />
              )}
              <text
                x={x + barWidth / 2}
                y={value >= 0 ? y - 6 : y + h + 12}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill="#0f172a"
              >
                {value !== 0 ? formatValue(value) : ""}
              </text>
              <text
                x={x + barWidth / 2}
                y={chartHeight + 16}
                textAnchor="middle"
                fontSize={10}
                fill={AXIS_LABEL_COLOR}
              >
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export type ChartSeries = {
  label: string;
  color: string;
  /** Null is a **gap**, not a zero: a month with no patients did not have a 0%
   *  margin, it had no margin, and drawing it at the floor invents a collapse
   *  that never happened. */
  values: (number | null)[];
};

export function TrendLineChart({
  buckets,
  series,
  formatValue,
  ariaLabel = "Trend",
}: {
  buckets: ChartBucket[];
  series: ChartSeries[];
  formatValue: (v: number) => string;
  ariaLabel?: string;
}) {
  const { ref, width } = useContainerWidth(640);

  const allValues = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  if (buckets.length === 0 || allValues.length === 0 || allValues.every((v) => v === 0)) {
    return <NoData />;
  }

  const chartHeight = 180;
  const labelSpace = 24;
  const padTop = 18;
  const padBottom = 12;
  const plotHeight = chartHeight - padTop - padBottom;
  const slotWidth = width / buckets.length;
  const max = Math.max(...allValues, 1);
  const min = Math.min(...allValues, 0);
  const span = max - min || 1;

  const yFor = (v: number) => padTop + (1 - (v - min) / span) * plotHeight;
  const xFor = (i: number) => i * slotWidth + slotWidth / 2;
  const zeroY = yFor(0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
          </span>
        ))}
      </div>
      <div ref={ref} className="w-full">
        <svg width={width} height={chartHeight + labelSpace} role="img" aria-label={ariaLabel}>
          <line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke="#e2e8f0" strokeWidth={1} />
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={0}
              y1={padTop + f * plotHeight}
              x2={width}
              y2={padTop + f * plotHeight}
              stroke="#f1f5f9"
              strokeWidth={1}
            />
          ))}
          {series.map((s) => {
            // A gap breaks the line rather than bridging it: joining across a
            // month with no data draws a trend through a period nobody
            // measured.
            const segments: string[] = [];
            let current: string[] = [];
            s.values.forEach((v, i) => {
              if (v === null) {
                if (current.length > 1) segments.push(current.join(" "));
                current = [];
                return;
              }
              current.push(`${xFor(i)},${yFor(v)}`);
            });
            if (current.length > 1) segments.push(current.join(" "));
            return segments.map((points, idx) => (
              <polyline
                key={`${s.label}-${idx}`}
                points={points}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ));
          })}
          {series.map((s) =>
            s.values.map((v, i) =>
              v === null ? null : (
                <circle key={`${s.label}-${i}`} cx={xFor(i)} cy={yFor(v)} r={3} fill={s.color}>
                  <title suppressHydrationWarning>{`${s.label} - ${buckets[i].label}: ${formatValue(
                    v
                  )}`}</title>
                </circle>
              )
            )
          )}
          {buckets.map((b, i) => (
            <text
              key={b.label + i}
              x={xFor(i)}
              y={chartHeight + 16}
              textAnchor="middle"
              fontSize={10}
              fill={AXIS_LABEL_COLOR}
            >
              {b.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

/**
 * Two or three series as bars side by side, per bucket.
 *
 * The shape for a comparison where both sides are amounts of the same thing --
 * revenue against costs, spend against what it brought in, what is owned
 * against what is owed. A line chart implies a continuous quantity moving; two
 * bars implies a pair being weighed, which is what these actually are.
 */
export function GroupedBarChart({
  buckets,
  series,
  formatValue,
  ariaLabel = "Comparison",
}: {
  buckets: ChartBucket[];
  series: { label: string; color: string; values: number[] }[];
  formatValue: (v: number) => string;
  ariaLabel?: string;
}) {
  const { ref, width } = useContainerWidth(640);

  if (buckets.length === 0 || series.every((s) => s.values.every((v) => v === 0))) {
    return <NoData />;
  }

  const chartHeight = 170;
  const labelSpace = 24;
  const slotWidth = width / buckets.length;
  const groupWidth = Math.min(slotWidth * 0.7, 90);
  const barWidth = Math.max(groupWidth / series.length - 3, 3);
  const max = Math.max(...series.flatMap((s) => s.values), 1);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
          </span>
        ))}
      </div>
      <div ref={ref} className="w-full">
        <svg width={width} height={chartHeight + labelSpace} role="img" aria-label={ariaLabel}>
          <line
            x1={0}
            y1={chartHeight}
            x2={width}
            y2={chartHeight}
            stroke="#e2e8f0"
            strokeWidth={1}
          />
          {buckets.map((bucket, i) => {
            const groupLeft = i * slotWidth + (slotWidth - groupWidth) / 2;
            return (
              <g key={bucket.label + i}>
                {series.map((s, si) => {
                  const value = s.values[i] ?? 0;
                  const h = (Math.max(0, value) / max) * (chartHeight - 20);
                  const x = groupLeft + si * (barWidth + 3);
                  return (
                    <rect
                      key={s.label}
                      x={x}
                      y={chartHeight - h}
                      width={barWidth}
                      height={h}
                      fill={s.color}
                      rx={2}
                    >
                      <title suppressHydrationWarning>{`${s.label} - ${bucket.label}: ${formatValue(
                        value
                      )}`}</title>
                    </rect>
                  );
                })}
                <text
                  x={i * slotWidth + slotWidth / 2}
                  y={chartHeight + 16}
                  textAnchor="middle"
                  fontSize={10}
                  fill={AXIS_LABEL_COLOR}
                >
                  {bucket.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/**
 * One bar against a target, with the target marked.
 *
 * Used for break-even: "42 sessions delivered against 35 needed" is a
 * comparison of one number to one threshold, and a bar chart of two bars
 * invites reading them as two independent quantities.
 */
export function TargetBar({
  actual,
  target,
  actualLabel,
  targetLabel,
}: {
  actual: number;
  target: number;
  actualLabel: string;
  targetLabel: string;
}) {
  const max = Math.max(actual, target, 1);
  const actualPercent = (actual / max) * 100;
  const targetPercent = (target / max) * 100;
  const covered = actual >= target;

  return (
    <div className="space-y-2">
      <div className="relative h-10 overflow-hidden rounded-xl bg-slate-100">
        <div
          className={`h-10 rounded-xl transition-all ${covered ? "bg-emerald-500" : "bg-amber-500"}`}
          style={{ width: `${actualPercent}%` }}
        />
        {/* The threshold as a line across the bar rather than a second bar:
            break-even is a point you are past or short of, not a quantity
            sitting beside yours. */}
        <div
          className="absolute inset-y-0 w-0.5 bg-slate-900"
          style={{ left: `${targetPercent}%` }}
          aria-hidden
        />
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-[11px] font-semibold">
        <span className={covered ? "text-emerald-700" : "text-amber-700"}>{actualLabel}</span>
        <span className="text-slate-600">{targetLabel}</span>
      </div>
    </div>
  );
}

/** A list of labelled amounts as proportional bars -- what a total is made of,
 *  where the parts have names rather than dates. */
export function CompositionBars({
  rows,
  formatValue,
  color = CHART_COLOR,
}: {
  rows: { label: string; amountPaise: number; note?: string }[];
  formatValue: (paise: number) => string;
  color?: string;
}) {
  const max = Math.max(...rows.map((r) => r.amountPaise), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label} className="text-xs">
          <div className="flex items-center gap-3">
            <span className="w-40 shrink-0 truncate font-semibold text-slate-700">{row.label}</span>
            <div className="h-4 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-4 rounded-full"
                style={{ width: `${(row.amountPaise / max) * 100}%`, backgroundColor: color }}
              />
            </div>
            <span className="w-28 text-right font-bold tabular-nums text-slate-900">
              {formatValue(row.amountPaise)}
            </span>
          </div>
          {row.note && <p className="ml-0 mt-1 text-[10px] text-slate-500 sm:ml-43">{row.note}</p>}
        </li>
      ))}
    </ul>
  );
}
