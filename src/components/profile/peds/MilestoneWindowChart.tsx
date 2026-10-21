"use client";

import { useId, useState } from "react";
import MilestoneMarker from "@/components/profile/peds/MilestoneMarker";
import {
  PEDS_CHART_LEGEND,
  pedsChartGeometry,
  type ChartGeometry,
  type ChartRow,
} from "@/lib/pedsChartGeometry";
import type { MilestoneWindowsView } from "@/lib/pedsMilestoneWindows";
import type { Voice } from "@/lib/progressView";

const BAR_FILL = "color-mix(in srgb, var(--chart-brand-soft) 28%, transparent)";

function Track({ geometry, row }: { geometry: ChartGeometry; row: ChartRow }) {
  return (
    <span aria-hidden className="relative block h-10 w-full">
      {/* Gridlines: the same ticks as the axis, so a stacked row reads without its own axis. */}
      {geometry.ticks.map((t) => (
        <span
          key={t.months}
          className="absolute top-2 bottom-2 w-px bg-slate-100"
          style={{ left: `${t.xPct}%` }}
        />
      ))}
      <span className="absolute inset-x-0 top-[19px] h-0.5 bg-slate-100" />
      <span
        className="absolute top-[13px] h-3.5 rounded-full"
        style={{
          left: `${row.barLeftPct}%`,
          width: `${row.barWidthPct}%`,
          background: BAR_FILL,
        }}
      />
      {geometry.todayPct !== null && (
        <span
          className="absolute top-0 bottom-0 w-0.5 opacity-60"
          style={{
            left: `${geometry.todayPct}%`,
            background: "var(--chart-ink)",
            transform:
              geometry.todayPct >= 100 ? "translateX(-2px)" : undefined,
          }}
        />
      )}
      {row.marker && (
        <span
          className="absolute top-5 flex items-center justify-center"
          style={{
            left: `${row.marker.xPct}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <MilestoneMarker marker={row.marker} />
        </span>
      )}
    </span>
  );
}

function Axis({ geometry }: { geometry: ChartGeometry }) {
  return (
    <span aria-hidden className="relative block h-5 w-full">
      {geometry.ticks.map((t) => (
        <span
          key={t.months}
          className="absolute text-[11px] text-slate-600"
          style={{ left: `${t.xPct}%`, transform: "translateX(-50%)" }}
        >
          {t.label}
        </span>
      ))}
    </span>
  );
}

/**
 * The paediatric condition picture: one bar per WHO milestone for the age
 * range in which most children reach it, one marker for where this child is
 * (see pedsChartGeometry.ts for the encodings and the words), a today line
 * and a legend. Every geometry and word comes from the tested module.
 *
 * Stacked on a phone - the milestone's name above its own full-width track -
 * and a name column beside the track from `sm`, so the axis is never
 * squeezed. Each row is a real button (the definition, who saw it, the date
 * and the usual range open under it) named by one full sentence, and "Show
 * as a table" swaps the picture for the same facts in a table.
 */
export default function MilestoneWindowChart({
  windows,
  voice,
}: {
  windows: MilestoneWindowsView;
  voice: Voice;
}) {
  const geometry = pedsChartGeometry(windows, voice);
  const clinician = voice === "clinician";
  const [open, setOpen] = useState<string | null>(null);
  const [asTable, setAsTable] = useState(false);
  const baseId = useId();
  const labelCol = "sm:grid-cols-[minmax(9rem,11.5rem)_minmax(0,1fr)]";

  const today = geometry.todayLabel;
  const todayShift =
    geometry.todayPct === null
      ? 0
      : geometry.todayPct > 78
        ? -100
        : geometry.todayPct < 22
          ? 0
          : -50;

  return (
    <div data-testid="peds-chart" data-placed={geometry.placed}>
      <div className="mb-2 flex justify-end print:hidden">
        <button
          type="button"
          aria-pressed={asTable}
          onClick={() => setAsTable((v) => !v)}
          className="min-h-[44px] rounded-lg px-3 text-xs font-semibold text-teal-800 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
        >
          {asTable ? "Show as a chart" : "Show as a table"}
        </button>
      </div>

      {asTable ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table
            className="w-full min-w-[34rem] border-collapse text-left text-sm"
            data-testid="peds-chart-table"
          >
            <caption className="sr-only">
              Movement milestones, the age range in which most children reach
              each, and where this child is
            </caption>
            <thead className="bg-slate-50 text-xs text-slate-700">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Milestone
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Most children
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {clinician ? "Finding" : "Your child"}
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  When
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {clinician ? "Who saw it" : "Who told us"}
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Against the range
                </th>
              </tr>
            </thead>
            <tbody>
              {geometry.rows.map((r) => (
                <tr key={r.key} className="border-t border-slate-100 align-top">
                  <th
                    scope="row"
                    className="px-3 py-2 font-semibold text-slate-900"
                  >
                    {r.label}
                  </th>
                  <td className="px-3 py-2 text-slate-700">{r.windowText}</td>
                  <td className="px-3 py-2 text-slate-800">{r.statusText}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {r.whenText || "-"}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {r.whoText || "-"}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {r.positionText || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div>
          <div className={`mb-1 grid gap-x-3 ${labelCol}`}>
            <span className="hidden sm:block" />
            <div>
              <Axis geometry={geometry} />
              <p className="mt-0.5 text-center text-[11px] text-slate-600">
                Age in months
                {windows.age.status === "ok" &&
                windows.age.basis === "corrected"
                  ? " (corrected)"
                  : ""}
              </p>
            </div>
          </div>
          <ul className="divide-y divide-slate-100 border-y border-slate-100">
            {geometry.rows.map((r) => {
              const expanded = open === r.key;
              const panelId = `${baseId}-${r.key}`;
              return (
                <li key={r.key}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    aria-label={r.summary}
                    data-milestone={r.key}
                    onClick={() => setOpen(expanded ? null : r.key)}
                    className={`grid w-full min-w-0 gap-x-3 gap-y-0.5 rounded-lg px-0 py-1.5 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${labelCol} sm:items-center`}
                  >
                    <span className="min-w-0 sm:min-h-[2.5rem]">
                      <span className="block text-sm font-semibold leading-snug text-slate-900 [overflow-wrap:anywhere]">
                        {r.label}
                      </span>
                      <span className="block text-xs leading-snug text-slate-700">
                        {r.statusText}
                      </span>
                    </span>
                    <Track geometry={geometry} row={r} />
                  </button>
                  {expanded && (
                    <dl
                      id={panelId}
                      className="mb-2 grid gap-x-4 gap-y-1 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-700 sm:grid-cols-[auto_minmax(0,1fr)]"
                      data-testid="peds-chart-detail"
                    >
                      <dt className="font-semibold text-slate-900">
                        {clinician ? "Counts as reached when" : "What counts"}
                      </dt>
                      <dd>{r.reachedWhen}</dd>
                      <dt className="font-semibold text-slate-900">
                        Most children
                      </dt>
                      <dd>{r.windowText}</dd>
                      {r.whenText && (
                        <>
                          <dt className="font-semibold text-slate-900">
                            {clinician ? "First seen" : "When"}
                          </dt>
                          <dd>{r.whenText}</dd>
                        </>
                      )}
                      {r.whoText && (
                        <>
                          <dt className="font-semibold text-slate-900">
                            {clinician ? "Who saw it" : "Who told us"}
                          </dt>
                          <dd>{r.whoText}</dd>
                        </>
                      )}
                      {r.positionText && (
                        <>
                          <dt className="font-semibold text-slate-900">
                            Against the range
                          </dt>
                          <dd>{r.positionText}</dd>
                        </>
                      )}
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
          {today && geometry.todayPct !== null && (
            <div className={`mt-1 grid gap-x-3 ${labelCol}`}>
              <span className="hidden sm:block" />
              <span aria-hidden className="relative block h-5">
                <span
                  className="absolute whitespace-nowrap text-[11px] font-bold text-slate-900"
                  style={{
                    left: `${geometry.todayPct}%`,
                    transform: `translateX(${todayShift}%)`,
                  }}
                >
                  {today}
                  {geometry.todayOffAxis ? " (off this scale)" : ""}
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      <ul
        className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-700"
        aria-label="Key to the chart"
      >
        {PEDS_CHART_LEGEND.map((l) => (
          <li key={l.id} className="inline-flex items-center gap-1.5">
            {l.marker === "bar" ? (
              <span
                aria-hidden
                className="inline-block h-3 w-6 rounded-full"
                style={{ background: BAR_FILL }}
              />
            ) : l.marker === "today" ? (
              <span
                aria-hidden
                className="inline-block h-3.5 w-0.5 opacity-60"
                style={{ background: "var(--chart-ink)" }}
              />
            ) : (
              <MilestoneMarker marker={l.marker} size={14} />
            )}
            {clinician ? l.label : l.patientLabel}
          </li>
        ))}
      </ul>
    </div>
  );
}
