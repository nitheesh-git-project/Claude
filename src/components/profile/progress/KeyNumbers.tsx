import type { ProfileKind } from "@/lib/outcomeMeasures";
import type { MeasureSeries, MilestoneTarget } from "@/lib/outcomeSeries";
import { keyTile, pickHeadlineSeries, type Voice } from "@/lib/progressView";

const DELTA_TONE = {
  good: "text-emerald-700",
  bad: "text-red-700",
  neutral: "text-slate-600",
} as const;

/**
 * The four headline tiles under the profile's header: the measures with the
 * most reviews, each with its latest reading, a sparkline, the move since
 * the first review and the goal. An optional sessions tile (done of
 * planned, with a bar) takes one of the four places.
 *
 * Every figure is shaped by `keyTile()` (src/lib/progressView.ts); this file
 * lays them out. Two columns on a phone, four from `lg`; a tile's text
 * wraps rather than truncating, so no figure is ever cut off. The
 * sparkline is decoration (`aria-hidden`): the delta line beside it says the
 * same thing in words.
 */
export default function KeyNumbers({
  series,
  milestones = [],
  profileKind,
  voice,
  sessions,
}: {
  series: MeasureSeries[];
  milestones?: MilestoneTarget[];
  profileKind: ProfileKind;
  voice: Voice;
  /** Sessions done of the plan; `total` null when there is no fixed number. */
  sessions?: { done: number; total: number | null; next?: string | null } | null;
}) {
  const tiles = pickHeadlineSeries(series, sessions ? 3 : 4).map((s) => keyTile(s, milestones, profileKind, voice, series));

  if (tiles.length === 0 && !sessions) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-5 text-sm text-slate-600">
        {voice === "clinician"
          ? "Headline numbers appear once a measure has been recorded."
          : "Your key numbers appear after your first measurements."}
      </p>
    );
  }

  const percent =
    sessions && sessions.total && sessions.total > 0 ? Math.min(100, Math.round((sessions.done / sessions.total) * 100)) : null;

  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <li key={tile.key} className="flex min-w-0 flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4">
          <p className="text-xs font-semibold text-slate-600 [overflow-wrap:anywhere]">
            {tile.label}
            <span className="sr-only"> ({tile.fullLabel})</span>
          </p>
          <p className="font-display text-2xl font-extrabold leading-tight text-slate-900 [overflow-wrap:anywhere] sm:text-[1.75rem]">
            {tile.valueText}
          </p>
          {tile.sparkPath && (
            <svg viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true" className="block h-7 w-full">
              <path
                d={tile.sparkPath}
                fill="none"
                stroke="var(--chart-brand-soft)"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
          <p className={`text-[13px] font-semibold ${DELTA_TONE[tile.deltaTone]}`}>{tile.deltaText}</p>
          {tile.goalText && <p className="text-xs text-slate-600">{tile.goalText}</p>}
        </li>
      ))}
      {sessions && (
        <li className="flex min-w-0 flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4">
          <p className="text-xs font-semibold text-slate-600">Sessions</p>
          <p className="font-display text-2xl font-extrabold leading-tight text-slate-900 sm:text-[1.75rem]">
            {sessions.done}
            {sessions.total !== null && <span className="ml-1 text-sm font-medium text-slate-600">of {sessions.total}</span>}
          </p>
          {percent !== null && (
            <div
              role="progressbar"
              aria-label="Sessions done"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="my-2 h-2 rounded-full bg-slate-200"
            >
              <div className="h-2 rounded-full bg-teal-700" style={{ width: `${percent}%` }} />
            </div>
          )}
          {sessions.total !== null && sessions.total > sessions.done && (
            <p className="text-[13px] font-semibold text-slate-700">{sessions.total - sessions.done} to go</p>
          )}
          {sessions.next && <p className="text-xs text-slate-600">Next: {sessions.next}</p>}
        </li>
      )}
    </ul>
  );
}
