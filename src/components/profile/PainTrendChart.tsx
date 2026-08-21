"use client";

import { useState } from "react";
import { PAIN_BAND_LABEL, painBand, formatPainOutOfTen } from "@/lib/painMap";
import type { PainTrendPoint } from "@/lib/healthProfileSummary";

const WIDTH = 320;
const HEIGHT = 118;
const PAD = { top: 10, right: 10, bottom: 20, left: 26 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/**
 * "Am I getting better?" as one line: the average pain your therapist
 * recorded on each exam day, oldest to newest. One series, so no legend —
 * the card's own heading names it — and a single direct label on the
 * newest point rather than a number over every dot.
 *
 * Deliberately not a second series for the patient's own 0-10 severity:
 * two scales on one axis (0-10 vs 0-100%) is the dual-axis mistake, and
 * only the clinical figure is re-measured on a schedule anyway.
 */
export default function PainTrendChart({ points }: { points: PainTrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Nothing to chart yet — this line appears once your therapist has examined you twice, and shows whether
        the pain is coming down.
      </p>
    );
  }

  const x = (i: number) => PAD.left + (points.length === 1 ? PLOT_W / 2 : (i / (points.length - 1)) * PLOT_W);
  const y = (percent: number) => PAD.top + PLOT_H - (percent / 100) * PLOT_H;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.percent)}`).join(" ");
  const area = `${line} L ${x(points.length - 1)} ${PAD.top + PLOT_H} L ${x(0)} ${PAD.top + PLOT_H} Z`;
  const latest = points[points.length - 1];
  const first = points[0];
  const change = points.length > 1 ? latest.percent - first.percent : null;
  const active = hover !== null ? points[hover] : null;

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-display text-2xl font-bold leading-none text-slate-800">{formatPainOutOfTen(latest.percent)}</p>
        <p className="text-xs text-slate-500">
          {PAIN_BAND_LABEL[painBand(latest.percent)].toLowerCase()} pain at your last exam
          {change !== null && change !== 0 && (
            <>
              {" · "}
              <span className={change < 0 ? "font-semibold text-emerald-600" : "font-semibold text-red-600"}>
                {change < 0 ? "down" : "up"} {(Math.abs(change) / 10).toFixed(1)} points
              </span>{" "}
              since the first
            </>
          )}
        </p>
      </div>

      <div className="relative mt-2">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full"
          role="img"
          aria-label={`Pain recorded at each exam: ${points
            .map((p) => `${formatDay(p.date)} ${formatPainOutOfTen(p.percent)}`)
            .join(", ")}`}
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
          {/* Ticks stay percentages internally (that is what the scale
              plots) but are labelled out of ten, matching every figure on
              this chart and the patient's own 0-10 answers. */}
          {[0, 50, 100].map((tick) => (
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
                {tick / 10}
              </text>
            </g>
          ))}

          <path d={area} fill="#0d9488" fillOpacity={0.08} />
          <path d={line} fill="none" stroke="#0d9488" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

          {active && (
            <line
              x1={x(hover!)}
              x2={x(hover!)}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              stroke="#0d9488"
              strokeOpacity={0.35}
              strokeWidth={1}
            />
          )}

          {points.map((p, i) => (
            <circle
              key={p.date}
              cx={x(i)}
              cy={y(p.percent)}
              r={hover === i ? 5 : 4}
              fill="#0d9488"
              stroke="#ffffff"
              strokeWidth={2}
            />
          ))}

          <text
            x={Math.min(x(points.length - 1) + 6, WIDTH - PAD.right)}
            y={Math.max(y(latest.percent) - 7, PAD.top + 6)}
            textAnchor="end"
            fontSize={9}
            fontWeight={700}
            fill="#0f766e"
          >
            {formatPainOutOfTen(latest.percent)}
          </text>

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
            style={{ left: `${(x(hover!) / WIDTH) * 100}%`, top: `${(y(active.percent) / HEIGHT) * 100}%` }}
          >
            <p className="font-semibold text-slate-700">{formatDay(active.date)}</p>
            <p className="text-slate-500">
              {formatPainOutOfTen(active.percent)} · {active.regions} {active.regions === 1 ? "area" : "areas"} checked
            </p>
          </div>
        )}
      </div>

      <p className="mt-1 text-[11px] text-slate-400">Lower is better. Each dot is one exam by your therapist.</p>
    </div>
  );
}
