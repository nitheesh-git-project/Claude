"use client";

import { useState } from "react";
import DiaryLogDialog from "@/components/profile/neuro/DiaryLogDialog";
import { EntryRow } from "@/components/profile/neuro/DiaryPanel";
import type { CardioView } from "@/lib/cardioProfile";
import { formatClinicDate, formatClinicDateShort } from "@/lib/formatDateTime";
import type { ActiveMinutesWeekPoint } from "@/lib/patientDiary";
import type { Voice } from "@/lib/progressView";

const CARD = "min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6";
const RECENT = 6;

/**
 * Twelve clinic weeks of active minutes, one bar a week, the WHO's 150 as a
 * dashed line. A week nobody wrote in is a dashed baseline with no bar
 * ("nothing written down", never "no activity"); the week still going is
 * drawn lighter and labelled so it never reads as a fall; a week at or over
 * the goal is drawn in the green. The same weeks are a table for a screen
 * reader. Light activity (you could sing) is kept apart from what counts.
 */
function ActiveMinutesChart({ weeks, goal, voice }: { weeks: ActiveMinutesWeekPoint[]; goal: number; voice: Voice }) {
  const W = 320;
  const H = 160;
  const pad = { top: 18, right: 8, bottom: 34, left: 28 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const max = Math.max(Math.round(goal * 1.4), ...weeks.map((w) => w.minutes));
  const slot = plotW / weeks.length;
  const barW = Math.min(18, slot - 6);
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;
  const writtenWeeks = weeks.filter((w) => w.written);
  const summary =
    writtenWeeks.length === 0
      ? "No active minutes have been written down in the last twelve weeks."
      : `Active minutes a week against the goal of ${goal}: ${writtenWeeks.map((w) => `${w.minutes} in the week of ${formatClinicDateShort(w.weekStart)}`).join(", ")}. Weeks with nothing written down are blank.`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={summary} data-testid="active-minutes-chart">
        {[0, 0.5, 1].map((f) => {
          const gy = pad.top + plotH - f * plotH;
          return (
            <g key={f}>
              <line x1={pad.left} x2={W - pad.right} y1={gy} y2={gy} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={pad.left - 5} y={gy + 3} textAnchor="end" fontSize={9} fill="var(--chart-axis)">
                {Math.round(max * f)}
              </text>
            </g>
          );
        })}
        <line x1={pad.left} x2={W - pad.right} y1={y(goal)} y2={y(goal)} stroke="var(--chart-good)" strokeWidth={1.5} strokeDasharray="5 3" />
        <text x={pad.left + 2} y={y(goal) - 4} textAnchor="start" fontSize={9} fontWeight={700} fill="var(--chart-good)">
          Goal {goal}
        </text>
        {weeks.map((w, i) => {
          const cx = pad.left + slot * i + slot / 2;
          const h = w.written ? Math.max(3, (w.minutes / max) * plotH) : 0;
          return (
            <g key={w.weekStart}>
              {w.written ? (
                <rect x={cx - barW / 2} y={pad.top + plotH - h} width={barW} height={h} rx={2} fill={w.metGoal ? "var(--chart-good-soft)" : "var(--chart-brand-soft)"} fillOpacity={w.inProgress ? 0.45 : 1} />
              ) : (
                <line x1={cx - barW / 2} x2={cx + barW / 2} y1={pad.top + plotH - 1} y2={pad.top + plotH - 1} stroke="var(--chart-axis)" strokeWidth={1.5} strokeDasharray="2 3" />
              )}
              {w.written && (
                <text x={cx} y={pad.top + plotH - h - 4} textAnchor="middle" fontSize={8.5} fontWeight={600} fill="var(--chart-ink)">
                  {w.minutes}
                </text>
              )}
              {(i === 0 || i === weeks.length - 1 || i === Math.floor(weeks.length / 2)) && (
                <text x={cx} y={H - 8} textAnchor={i === 0 ? "start" : i === weeks.length - 1 ? "end" : "middle"} fontSize={9} fill="var(--chart-axis)">
                  {formatClinicDateShort(w.weekStart)}
                  {w.inProgress ? " (so far)" : ""}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="sr-only">
        <table>
          <caption>Active minutes written down, by week</caption>
          <thead>
            <tr>
              <th scope="col">Week of</th>
              <th scope="col">Minutes</th>
              <th scope="col">Goal reached</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.weekStart}>
                <th scope="row">{formatClinicDate(w.weekStart)}</th>
                <td>{w.written ? w.minutes : "Nothing written down"}</td>
                <td>{w.written ? (w.metGoal ? "Yes" : "No") : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--chart-good-soft)" }} />
          {voice === "patient" ? "Reached 150" : "Reached the goal"}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--chart-brand-soft)" }} />
          Under the goal
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block w-4 border-t-2 border-dashed border-slate-500" />
          Nothing written down that week
        </li>
      </ul>
    </div>
  );
}

/**
 * The heart and lung programme's dose: minutes of activity a week from the
 * patient's own diary. The patient logs them with the diary dialog; the
 * assigned therapist confirms they have seen an entry (an admin reads and
 * does neither). Everything here is the patient's account and says so.
 */
export default function ActiveMinutesPanel({
  voice,
  view,
  canLog,
  canConfirm,
}: {
  voice: Voice;
  view: Pick<CardioView, "activeMinutes" | "diary" | "diaryFailed">;
  canLog: boolean;
  canConfirm: boolean;
}) {
  const [logging, setLogging] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const clinician = voice === "clinician";
  const header = (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-lg font-bold text-slate-900">{clinician ? "Active minutes" : "Your active minutes"}</h2>
        <p className="mt-0.5 text-sm text-slate-700">
          {clinician
            ? "Minutes a week the patient wrote down, against the WHO's 150. Their own account until you confirm you have seen it."
            : "Write down the time you spend walking, cycling or doing your exercises. The aim is 150 minutes a week, built up slowly."}
        </p>
      </div>
      {canLog && (
        <button
          type="button"
          onClick={() => setLogging(true)}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 sm:w-auto print:hidden"
        >
          <i aria-hidden className="fa-solid fa-pen text-xs" />
          Log your active minutes
        </button>
      )}
    </div>
  );

  if (view.activeMinutes.status !== "ok" || view.diary.status !== "ok") {
    return (
      <section aria-label="Active minutes" className={CARD} data-testid="active-minutes-panel">
        {header}
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {clinician ? "We couldn't load the diary just now." : "We couldn't load your diary just now."} It is not empty - this is a problem reading it, so please try again in a moment.
        </p>
        {logging && <DiaryLogDialog profileKind="cardiopulmonary" initialKind="active_minutes" onClose={() => setLogging(false)} />}
      </section>
    );
  }

  const { weeks, goal } = view.activeMinutes;
  const awaiting = view.diary.awaiting;
  const rest = canConfirm ? view.diary.entries.filter((e) => !awaiting.some((a) => a.id === e.id)) : view.diary.entries;
  const shown = showAll ? rest : rest.slice(0, RECENT);
  const done = weeks.filter((w) => !w.inProgress);
  const last = done[done.length - 1];
  const current = weeks[weeks.length - 1];

  return (
    <section aria-label="Active minutes" className={CARD} data-testid="active-minutes-panel">
      {header}
      <dl className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-700">Last week</dt>
          <dd className="font-display text-xl font-bold text-slate-900">{last && last.written ? `${last.minutes} min` : "-"}</dd>
          <dd className="text-xs text-slate-700">{last && last.written ? (last.metGoal ? `Goal of ${goal} reached` : `Goal ${goal}`) : "Nothing written down"}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-700">This week so far</dt>
          <dd className="font-display text-xl font-bold text-slate-900">{current && current.written ? `${current.minutes} min` : "-"}</dd>
          <dd className="text-xs text-slate-700">{current && current.written ? "Not finished yet" : "Nothing written down yet"}</dd>
        </div>
      </dl>
      <div className="max-w-xl">
        <ActiveMinutesChart weeks={weeks} goal={goal} voice={voice} />
      </div>

      {canConfirm && awaiting.length > 0 && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/60 p-3 sm:p-4" data-testid="diary-awaiting">
          <h3 className="text-sm font-bold text-amber-900">Waiting for you to confirm ({awaiting.length})</h3>
          <p className="text-xs text-slate-700">Confirming says you have seen it and talked it over. It does not change what the patient wrote.</p>
          <ul className="mt-1 divide-y divide-amber-200/70">
            {awaiting.map((e) => (
              <EntryRow key={e.id} entry={e} voice={voice} canConfirm />
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5">
        <h3 className="font-display text-base font-bold text-slate-900">{clinician ? "Entries" : "What you wrote"}</h3>
        {rest.length === 0 ? (
          <p className="mt-1 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-4 text-sm text-slate-700">
            {clinician ? "Nothing written down yet. Nothing here means nothing was written - not that no exercise was done." : canLog ? "Nothing yet. After you have been active, write the minutes down here." : "Nothing written down yet."}
          </p>
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {shown.map((e) => (
                <EntryRow key={e.id} entry={e} voice={voice} canConfirm={false} />
              ))}
            </ul>
            {rest.length > RECENT && (
              <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1 inline-flex min-h-[44px] items-center rounded-lg px-1 text-sm font-semibold text-teal-800 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                {showAll ? "Show fewer" : `Show all ${rest.length}`}
              </button>
            )}
          </>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-700">
        {clinician ? "Light activity (the patient could sing) is kept apart and does not count towards the 150." : "Gentle activity where you could sing does not count towards the 150, but it still does you good."}
      </p>
      {logging && <DiaryLogDialog profileKind="cardiopulmonary" initialKind="active_minutes" onClose={() => setLogging(false)} />}
    </section>
  );
}
