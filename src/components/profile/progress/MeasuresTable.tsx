import { subjectWords, type ProfileSubject } from "@/lib/childVoice";
import { formatClinicDateShort } from "@/lib/formatDateTime";
import { outcomeMeasure } from "@/lib/outcomeMeasures";
import type { MeasureTableRow } from "@/lib/outcomeSeries";
import { describeDelta, formatReading } from "@/lib/progressChart";
import { shortSeriesLabel } from "@/lib/measureLabels";
import { changeWord, seriesName, type Voice } from "@/lib/progressView";

const CHANGE_CLASS: Record<NonNullable<MeasureTableRow["change"]>, string> = {
  better: "text-emerald-700",
  worse: "text-red-700",
  no_change: "text-slate-600",
  changed: "text-slate-600",
};

/**
 * First, now, goal and change for every measure on the record
 * (`measureTableRows`). The table scrolls sideways inside its own
 * container on a phone rather than squeezing five columns into 360 px; the
 * measure's name stays in the first column and is a row header, so a
 * screen reader reads each value with its measure. Change is always a word
 * as well as a colour, and a move inside the measurement error reads "No
 * real change" - never green.
 */
export default function MeasuresTable({ rows, voice, subject = "self" }: { rows: MeasureTableRow[]; voice: Voice; subject?: ProfileSubject }) {
  const w = subjectWords(subject, voice);
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-5 text-sm text-slate-600">
        {voice === "clinician"
          ? "No measurements recorded yet."
          : w("Your measurements appear here after your first review.")}
      </p>
    );
  }

  const lines = rows.map((row) => ({
    measureKey: row.measureKey,
    variant: row.variant,
    side: row.side,
    medicationState: row.medicationState,
    label: row.label,
    plainName: outcomeMeasure(row.measureKey)?.plainName ?? row.label,
    variantLabel: row.variantLabel,
  }));
  const labels = new Map(
    rows.map((row, i) => [row.seriesKey, { short: shortSeriesLabel(lines[i], voice, lines), full: seriesName(lines[i], voice) }])
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
        <caption className="sr-only">First, latest and goal reading for each measure</caption>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <th scope="col" className="px-3 py-2.5">
              Measure
            </th>
            <th scope="col" className="px-3 py-2.5">
              First
            </th>
            <th scope="col" className="px-3 py-2.5">
              Now
            </th>
            <th scope="col" className="px-3 py-2.5">
              Goal
            </th>
            <th scope="col" className="px-3 py-2.5">
              Change
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const reading = (v: number) => formatReading(v, row.decimals, row.unit);
            const delta =
              row.change === null
                ? null
                : describeDelta({ first: row.first.value, now: row.now.value, decimals: row.decimals, unit: row.unit, change: row.change });
            return (
              <tr key={row.seriesKey} className="border-b border-slate-100 last:border-0 align-top">
                <th scope="row" className="px-3 py-3 font-semibold text-slate-900 [overflow-wrap:anywhere]">
                  {labels.get(row.seriesKey)?.short}
                  {row.stateUnrecorded && <span className="block text-xs font-normal text-slate-700">State not recorded</span>}
                  <span className="sr-only"> ({labels.get(row.seriesKey)?.full})</span>
                </th>
                <td className="px-3 py-3 text-slate-800">
                  {reading(row.first.value)}
                  <span className="block text-xs text-slate-600">{formatClinicDateShort(row.first.measuredAt)}</span>
                </td>
                <td className="px-3 py-3 font-semibold text-slate-900">
                  {reading(row.now.value)}
                  <span className="block text-xs font-normal text-slate-600">{formatClinicDateShort(row.now.measuredAt)}</span>
                </td>
                <td className="px-3 py-3 text-slate-800">
                  {row.goal ? (
                    <>
                      {reading(row.goal.value)}
                      {row.goal.reached && <span className="block text-xs font-semibold text-emerald-700">Reached</span>}
                    </>
                  ) : (
                    <span className="text-slate-600">Not set</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  {row.change === null ? (
                    <span className="text-slate-600">{row.reviews < 2 ? "First reading" : row.stateUnrecorded ? "No change shown" : "Not judged"}</span>
                  ) : (
                    <>
                      <span className={`font-semibold ${CHANGE_CLASS[row.change]}`}>{changeWord(row.change)}</span>
                      {delta && <span className="block text-xs text-slate-600">{delta.text}</span>}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
