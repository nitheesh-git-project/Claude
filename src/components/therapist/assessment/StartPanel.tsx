"use client";

import Link from "next/link";
import { useState } from "react";
import Spinner from "@/components/system/Spinner";
import { useRouter } from "@/lib/useRouter";
import { failureText, type CockpitFailure } from "@/lib/cockpit";
import { startRun } from "@/components/therapist/assessment/api";

/**
 * Before a run exists: what is about to start, and one big button. The start
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
}: {
  patientId: string;
  patientName: string;
  appointmentId: string | null;
  protocols: { key: string; title: string }[];
  /** Said when the page could tell the session has not started; the route still decides. */
  sessionNote: string | null;
  chartHref: string;
}) {
  const router = useRouter();
  const [protocolKey, setProtocolKey] = useState(protocols[0]?.key ?? "");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CockpitFailure | null>(null);

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
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-xl space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" data-testid="start-panel">
      <div>
        <p className="text-[13px] font-bold uppercase tracking-wider text-teal-800">Guided video assessment</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-slate-900">{patientName}</h1>
      </div>
      <p className="text-base text-slate-800">
        You lead it live over the video call, one step at a time. This page is your second screen next to Google Meet; {patientName.split(" ")[0]} gets a
        simple display-only screen that follows you.
      </p>
      {sessionNote && (
        <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {sessionNote}
        </p>
      )}
      {protocols.length > 1 && (
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
      {protocols.length === 1 && <p className="text-sm font-semibold text-slate-900">{protocols[0].title}</p>}
      {failure && (
        <p role="alert" data-testid="start-failure" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
          {failureText(failure)}
        </p>
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
          {busy ? "Starting…" : "Start the guided assessment"}
        </button>
        <Link
          href={chartHref}
          className="inline-flex min-h-[56px] items-center justify-center rounded-xl border border-slate-300 px-5 text-base font-semibold text-slate-900 hover:border-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
        >
          Back to the chart
        </Link>
      </div>
    </div>
  );
}
