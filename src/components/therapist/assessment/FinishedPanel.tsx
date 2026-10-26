"use client";

import Link from "next/link";
import CareStatusControls from "@/components/profile/progress/CareStatusControls";
import type { EndReason } from "@/lib/assessmentRun";
import { END_REASONS } from "@/lib/assessmentRun";
import type { ProfileKind } from "@/lib/outcomeMeasures";

/**
 * The end of a run: what happened, the patient's screen saying All done, and
 * the draft of "Where things stand" waiting in the existing summary editor.
 * The draft is only ever a starting point; it is saved, if at all, as the
 * physiotherapist's own text through the care-status route.
 */
export default function FinishedPanel({
  patientId,
  patientName,
  profileKind,
  outcome,
  reason,
  summaryDraft,
  draftReadable,
  chartHref,
}: {
  patientId: string;
  patientName: string;
  profileKind: ProfileKind;
  outcome: "completed" | "abandoned";
  reason: EndReason | null;
  summaryDraft: string | null;
  draftReadable: boolean;
  chartHref: string;
}) {
  return (
    <div data-testid="finished-panel" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div>
        <p className="text-[13px] font-bold uppercase tracking-wider text-teal-800">{outcome === "completed" ? "Finished" : "Ended early"}</p>
        <h2 className="mt-1 font-display text-2xl font-extrabold text-slate-900">
          {outcome === "completed" ? "The guided assessment is saved" : "The guided assessment was ended"}
        </h2>
        {outcome === "abandoned" && reason && <p className="mt-1 text-base text-slate-800">{END_REASONS[reason]}. What was saved stays on the record.</p>}
        <p className="mt-1 text-sm text-slate-700">{patientName.split(" ")[0]}{"'"}s screen now says All done.</p>
      </div>
      {!draftReadable && (
        <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          We could not check the readings just now, so there is no draft. You can still write the summary yourself.
        </p>
      )}
      <div>
        <p className="mb-2 text-sm text-slate-700">
          A short {"“"}Where things stand{"”"} for {patientName.split(" ")[0]}, started for you from what was saved today. Change it into your own words
          before saving: they read it.
        </p>
        <CareStatusControls
          patientId={patientId}
          profileKind={profileKind}
          currentPhase={null}
          phaseIsInferred
          override={null}
          overrideStale={false}
          summaryDraft={summaryDraft}
          summaryOnly
        />
      </div>
      <Link
        href={chartHref}
        className="inline-flex min-h-[48px] items-center rounded-xl border border-slate-300 px-5 text-base font-semibold text-slate-900 hover:border-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
      >
        Back to the chart
      </Link>
    </div>
  );
}
