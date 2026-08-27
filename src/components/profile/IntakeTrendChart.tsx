"use client";

import { useState } from "react";
import type { IntakeTrendPoint } from "@/lib/healthProfileSummary";

const WIDTH = 320;
const HEIGHT = 118;
const PAD = { top: 10, right: 10, bottom: 20, left: 26 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/**
 * "Am I getting better?" as one line, for the two specialties that have no
 * examination layer yet.
 *
 * Where the orthopaedic chart plots the pain a therapist measured, this
 * plots the specialty's own headline answer over time -- independence for
 * neurological care, milestones reached for a child -- taken from the
 * submissions already on file. Nothing new is collected for it.
 *
 * Note the direction is the opposite of PainTrendChart's: on both of these
 * scales higher is better, so a rising line is good news and the colours
 * and the wording say so. Getting that backwards would tell a patient they
 * are deteriorating while they improve, which is why the two charts are
 * separate components rather than one with a flag.
 */
export default function IntakeTrendChart({
  points,
  max,
  unit,
  caption,
  emptyText,
}: {
  points: IntakeTrendPoint[];
  /** Top of the scale: 10 for independence, the milestone count for a child. */
  max: number;
  /** What one point means, e.g. "/ 10" or "milestones". */
  unit: string;
  caption: string;
  emptyText: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return <p className="text-sm text-slate-500">{emptyText}</p>;
  }

  const ceiling = Math.max(max, 1);
  const x = (i: number) =>
    PAD.left + (points.length === 1 ? PLOT_W / 2 : (i / (points.length - 1)) * PLOT_W);
  const y = (value: number) => PAD.top + PLOT_H - (Math.min(value, ceiling) / ceiling) * PLOT_H;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.value)}`).join(" ");
  const area = `${line} L ${x(points.length - 1)} ${PAD.top + PLOT_H} L ${x(0)} ${PAD.top + PLOT_H} Z`;
  const latest = points[points.length - 1];
  const first = points[0];
  const change = points.length > 1 ? latest.value - first.value : null;
  const active = hover !== null ? points[hover] : null;

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-display text-2xl font-bold leading-none text-slate-800">
          {latest.value}
          <span className="ml-1 text-sm font-semibold text-slate-400">{unit}</span>
        </p>
        {change !== null && change !== 0 && (
          <p className="text-xs text-slate-500">
            {/* Up is the good direction here. */}
            <span
              className={change > 0 ? "font-semibold text-emerald-600" : "font-semibold text-red-600"}
            >
              {change > 0 ? "up" : "down"} {Math.abs(change)}
            </span>{" "}
            since the first record
          </p>
        )}
      </div>

      <div className="relative mt-2">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full"
          role="img"
          aria-label={`${caption}: ${points.map((p) => `${formatDay(p.date)} ${p.value}`).join(", ")}`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const svgX = ((e.clientX - box.left) / box.width) * WIDTH;
            let nearest = 0;
            for (let i = 1; i < points.length; i++) {
              if (Math.abs(x(i) - svgX) < Math.abs(x(nearest) - svgX)) nearest = i;
            }
            setHover(nearest);
          }}
        >
          {[0, Math.round(ceiling / 2), ceiling].map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="#e2e8f0"
                strokeWidth={1}
              />
              <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" fontSize={8} fill="#94a3b8">
                {tick}
              </text>
            </g>
          ))}

          <path d={area} fill="#059669" fillOpacity={0.08} />
          <path
            d={line}
            fill="none"
            stroke="#059669"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {active && (
            <line
              x1={x(hover!)}
              x2={x(hover!)}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              stroke="#059669"
              strokeOpacity={0.35}
              strokeWidth={1}
            />
          )}

          {points.map((p, i) => (
            <circle
              key={p.date}
              cx={x(i)}
              cy={y(p.value)}
              r={hover === i ? 5 : 4}
              fill="#059669"
              stroke="#ffffff"
              strokeWidth={2}
            />
          ))}

          <text x={PAD.left} y={HEIGHT - 6} fontSize={8} fill="#94a3b8">
            {formatDay(first.date)}
          </text>
          {points.length > 1 && (
            <text x={WIDTH - PAD.right} y={HEIGHT - 6} textAnchor="end" fontSize={8} fill="#94a3b8">
              {formatDay(latest.date)}
            </text>
          )}
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] shadow-lg"
            style={{
              left: `${(x(hover!) / WIDTH) * 100}%`,
              top: `${(y(active.value) / HEIGHT) * 100}%`,
            }}
          >
            <p className="font-semibold text-slate-700">{formatDay(active.date)}</p>
            <p className="text-slate-500">
              {active.value} {unit}
            </p>
          </div>
        )}
      </div>

      <p className="mt-1 text-[11px] text-slate-400">Higher is better. {caption}</p>
    </div>
  );
}
