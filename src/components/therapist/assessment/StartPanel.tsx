"use client";

import Link from "next/link";
import { useState } from "react";
import Spinner from "@/components/system/Spinner";
import { useRouter } from "@/lib/useRouter";
import { failureText, type CockpitFailure } from "@/lib/cockpit";
import { postEnd, startRun } from "@/components/therapist/assessment/api";
import BeforeYouStart from "@/components/therapist/assessment/BeforeYouStart";
import ShareScreenStep from "@/components/therapist/assessment/ShareScreenStep";
import type { Briefing } from "@/lib/cockpitBriefing";
import { readinessLine, type Readiness } from "@/lib/sessionPrep";
import { formatClinicTime } from "@/lib/formatDateTime";

/**
 * Before a run exists (T6): who, which assessment (chosen for the
 * condition, with Change), the "Before you start" notes as one line that
 * opens, and one big button - readable in five seconds. The optional patient
 * screen sits folded below the button. The start
 * route is the gate (a started session, the protocol from the patient's
 * condition type); an assessment already open for this physiotherapist is
 * simply carried on with, another's is said plainly.
 */
export default function StartPanel({
  patientId,
  patientName,
  appointmentId,
  protocols,
  sessionNote,
  chartHref,
  briefing,
  readiness = { status: "no_session" },
}: {
  patientId: string;
  patientName: string;
  appointmentId: string | null;
  protocols: { key: string; title: string }[];
  /** Said when the page could tell the session has not started; the route still decides. */
  sessionNote: string | null;
  chartHref: string;
  briefing: Briefing;
  /** Whether the patient ticked the get-ready list before the call (P1). */
  readiness?: Readiness;
}) {
  const router = useRouter();
  const [protocolKey, setProtocolKey] = useState(protocols[0]?.key ?? "");
  // The protocol is chosen for the patient's condition; Change opens the others (T6).
  const [picking, setPicking] = useState(false);
  const chosen = protocols.find((p) => p.key === protocolKey) ?? protocols[0];
  const readyLine = readinessLine(readiness, patientName.split(" ")[0] || "The patient", formatClinicTime);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CockpitFailure | null>(null);
  // Another physiotherapist's run left open: any assigned physiotherapist may end it.
  const [stuckRunId, setStuckRunId] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    const result = await startRun({ patientId, appointmentId, protocolKey: protocolKey || undefined });
    if (result.ok || ("conflict" in result && result.conflict.yours)) {
      // Started, or already yours and open: either way the page now holds the run.
      router.refresh();
      return;
    }
    setFailure(result.failure);
    setStuckRunId("conflict" in result ? result.conflict.runId : null);
    setBusy(false);
  }

  async function endStuck() {
    if (busy || !stuckRunId) return;
    setBusy(true);
    const result = await postEnd({ runId: stuckRunId, outcome: "abandoned", reason: "other" });
    if (result.ok) {
      setStuckRunId(null);
      setFailure(null);
      setBusy(false);
      return;
    }
    setFailure(result.failure);
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-xl space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" data-testid="start-panel">
      <div>
        <p className="text-[13px] font-bold uppercase tracking-wider text-teal-800">Guided check</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-slate-900">{patientName}</h1>
        <p data-testid="start-protocol" className="mt-1 flex flex-wrap items-center gap-x-2 text-base text-slate-800">
          <span>{chosen?.title ?? "No assessment for this condition"}</span>
          {protocols.length > 1 && (
            <button
              type="button"
              data-testid="change-protocol"
              aria-expanded={picking}
              aria-label={picking ? "Done choosing the assessment" : "Change the assessment"}
              onClick={() => setPicking((v) => !v)}
              className="min-h-[44px] rounded-lg px-1 font-semibold text-teal-800 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              {picking ? "Done" : "Change"}
            </button>
          )}
        </p>
      </div>
      {sessionNote && (
        <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {sessionNote}
        </p>
      )}
      {readyLine && (
        <p
          data-testid="start-readiness"
          className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[15px] ${
            readyLine.tone === "ok" ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-slate-200 bg-slate-50 text-slate-800"
          }`}
        >
          <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${readyLine.tone === "ok" ? "bg-emerald-600" : "bg-slate-400"}`} />
          <span>{readyLine.text}</span>
        </p>
      )}
      <BeforeYouStart briefing={briefing} compact />
      {protocols.length > 1 && picking && (
        <fieldset>
          <legend className="text-sm font-semibold text-slate-900">Which assessment?</legend>
          <div className="mt-2 flex flex-col gap-2">
            {protocols.map((p) => (
              <label
                key={p.key}
                className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border px-3.5 text-base ${
                  protocolKey === p.key ? "border-teal-700 bg-teal-50" : "border-slate-300 bg-white"
                }`}
              >
                <input type="radio" name="protocol" value={p.key} checked={protocolKey === p.key} onChange={() => setProtocolKey(p.key)} className="h-5 w-5 accent-teal-700" />
                {p.title}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {failure && (
        <p role="alert" data-testid="start-failure" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
          {failureText(failure)}
        </p>
      )}
      {stuckRunId && (
        <button
          type="button"
          data-testid="end-stuck-assessment"
          onClick={() => void endStuck()}
          disabled={busy}
          className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-amber-400 bg-amber-50 px-5 text-base font-semibold text-amber-900 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 disabled:opacity-60"
        >
          End the open assessment, then start yours
        </button>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          data-testid="start-assessment"
          onClick={() => void start()}
          disabled={busy}
          className="inline-flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-xl bg-teal-700 px-6 text-lg font-bold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {busy && <Spinner />}
          {busy ? "Starting…" : "Start guided check"}
        </button>
        <Link
          href={chartHref}
          className="inline-flex min-h-[56px] items-center justify-center rounded-xl border border-slate-300 px-5 text-base font-semibold text-slate-900 hover:border-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
        >
          Back to Health Profile
        </Link>
      </div>
      <ShareScreenStep firstName={patientName.split(" ")[0] || "the patient"} />
    </div>
  );
}
