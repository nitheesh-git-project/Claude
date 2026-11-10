"use client";

import { useState } from "react";
import Spinner from "@/components/system/Spinner";
import { debugNowHeaders } from "@/lib/debugNow";
import type { SummaryRow } from "@/lib/cockpit";
import { NETWORK_ERROR_MESSAGE, progressErrorMessage, readProgressFailure } from "@/lib/progressErrors";

/**
 * The summary step (B8): today's readings with what they were at the first
 * review and the last one, a "target met" chip where a reading meets an
 * unreached milestone, and Mark reached on it - the existing milestone route
 * (`mark_reached` with this reading as the proof), which checks the proof
 * again. Reaching a milestone is the physiotherapist's decision; nothing here
 * marks one by itself.
 */
export default function SummaryTool({
  patientId,
  rows,
  summaryLine,
  milestonesUnreadable,
}: {
  patientId: string;
  rows: SummaryRow[];
  summaryLine: string;
  milestonesUnreadable: boolean;
}) {
  const [reached, setReached] = useState<Record<string, true>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function markReached(milestoneId: string, measurementId: string) {
    if (busy) return;
    setBusy(milestoneId);
    setError(null);
    try {
      const res = await fetch("/api/therapist/care-milestones/save", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...debugNowHeaders() },
        body: JSON.stringify({ patientId, action: "mark_reached", milestoneId, measurementId }),
      });
      if (!res.ok) {
        setError(progressErrorMessage(await readProgressFailure(res), "reached"));
        return;
      }
      setReached((prev) => ({ ...prev, [milestoneId]: true }));
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3" data-testid="summary-tool">
      <p className="text-base font-semibold text-slate-900">Check today{"'"}s results before you finish.</p>
      <p className="text-sm text-slate-700">{summaryLine}</p>
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[22rem] text-left text-[15px]" data-testid="summary-results">
            <thead className="bg-slate-50 text-[13px] text-slate-700">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Test</th>
                <th scope="col" className="px-3 py-2 font-semibold">First</th>
                <th scope="col" className="px-3 py-2 font-semibold">Last</th>
                <th scope="col" className="px-3 py-2 font-semibold">Now</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 align-top">
                  <th scope="row" className="px-3 py-2 font-medium text-slate-900">
                    {r.label}
                    {r.meets && (
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[13px] font-semibold text-emerald-900" data-testid="target-met">
                          Target met: {r.meets.title}
                        </span>
                        {reached[r.meets.id] ? (
                          <span role="status" className="text-[13px] font-bold text-emerald-800">
                            Milestone marked reached
                          </span>
                        ) : (
                          <button
                            type="button"
                            data-testid="mark-reached"
                            disabled={!!busy}
                            onClick={() => void markReached(r.meets!.id, r.measurementId)}
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-emerald-700 bg-white px-3 text-sm font-bold text-emerald-900 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-60"
                          >
                            {busy === r.meets.id && <Spinner />}
                            Mark reached
                          </button>
                        )}
                      </span>
                    )}
                  </th>
                  <td className="px-3 py-2 text-slate-700">{r.first ?? "-"}</td>
                  <td className="px-3 py-2 text-slate-700">{r.last ?? "-"}</td>
                  <td className="px-3 py-2 font-bold text-slate-900">{r.now}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {milestonesUnreadable && (
        <p role="status" className="text-sm font-semibold text-amber-900">
          We couldn{"'"}t check the milestones just now, so a target met today is not shown. Mark it from the chart.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
      <p className="text-sm text-slate-700">
        Save and finish ends the assessment and gives you a draft of {"“"}Where things stand{"”"} to put into your own words.
      </p>
    </div>
  );
}
