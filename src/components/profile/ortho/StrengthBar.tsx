import type { ReactNode } from "react";
import { symmetryBarGeometry } from "@/lib/rangeGauge";

/**
 * The leg-strength bar: the weaker leg as a percentage of the other leg,
 * with the goal as a tick. A thin drawing over `symmetryBarGeometry`. The
 * figures are printed under the bar and in `aria-label`, so the fill and
 * tick are never the only signal.
 */
export default function StrengthBar({
  title,
  subtitle,
  percent,
  start = null,
  goal,
  children,
}: {
  title: string;
  subtitle: string;
  percent: number;
  start?: number | null;
  goal: number;
  /** Extra lines under the bar (the straightening readings). */
  children?: ReactNode;
}) {
  const g = symmetryBarGeometry({ percent, goal });
  const label = `${title}: ${percent} percent of the other side${start !== null ? `, started at ${start}` : ""}, goal ${goal} percent${g.reachedGoal ? " (reached)" : ""}.`;
  return (
    <figure className="m-0 flex min-w-0 flex-col gap-2.5 rounded-xl border border-slate-200 p-3.5">
      <figcaption>
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="block text-xs text-slate-700">{subtitle}</span>
      </figcaption>
      <div role="img" aria-label={label} className="relative mt-1 h-3 rounded-md bg-slate-200">
        <div className="h-3 rounded-md bg-teal-700" style={{ width: `${g.fillPercent}%` }} />
        {g.goalPercent !== null && (
          <div aria-hidden className="absolute -top-1 h-5 w-0.5 bg-emerald-700" style={{ left: `${g.goalPercent}%` }} />
        )}
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <strong className="text-sm text-slate-900">{percent}%</strong>
        <span className="font-semibold text-emerald-800">
          Goal {goal}%{g.reachedGoal ? " (reached)" : ""}
        </span>
      </div>
      {start !== null && <p className="text-xs text-slate-700">Started at {start}%</p>}
      {children}
    </figure>
  );
}
