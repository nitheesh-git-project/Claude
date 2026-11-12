"use client";

import { useState } from "react";
import SafetyCheckDialog from "@/components/profile/cardio/SafetyCheckDialog";
import RecordTestButton, { type RecordSetup } from "@/components/profile/progress/RecordTestButton";
import type { CardioView } from "@/lib/cardioProfile";
import { CARDIO_DO_NOT_EXERCISE_SYMPTOMS } from "@/lib/cardioSafety";
import { formatClinicDate } from "@/lib/formatDateTime";

/**
 * The clinician's "before every session" card: what the latest resting
 * readings say against the patient's own limits (stop, not checked, or
 * clear), the questions that are not readings, and the doors to take the
 * readings now and to start the guided six-minute walk. The refusal wording
 * is cardioSafety's; the walk itself will not start while a red flag stands
 * (SixMinuteWalkGuide). An unreadable record says so rather than reading as
 * clear.
 */
export default function PreSessionCheckCard({ view, setup }: { view: CardioView; setup: RecordSetup | null }) {
  const [open, setOpen] = useState(false);
  const check = view.vitalsCheck;
  const v = view.vitals;
  const latest = [v.restingHeartRate, v.bloodPressureRest, v.spo2Rest].filter(Boolean).map((r) => r!.measuredAt).sort().pop();
  return (
    <section aria-label="Before the session" className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4" data-testid="pre-session-check">
      <h3 className="font-display text-base font-bold text-slate-900">Before every session</h3>
      <p className="mt-0.5 text-xs text-slate-700">Resting readings against this patient&apos;s own limits{latest ? `, latest ${formatClinicDate(latest)}` : ""}.</p>
      {view.measuresFailed ? (
        <p role="status" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
          We couldn&apos;t load the readings just now, so this check could not be made. It is not clear - take the readings again.
        </p>
      ) : check.status === "stop" ? (
        <div role="status" className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-950" data-testid="pre-session-stop">
          <p className="font-bold">{check.refusal?.clinician}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {check.flags.map((f) => (
              <li key={f.code}>{f.clinicianText}</li>
            ))}
          </ul>
        </div>
      ) : check.status === "incomplete" ? (
        <p role="status" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950" data-testid="pre-session-incomplete">
          Not checked: {check.notChecked.join(", ")}. Take them before exercise.
        </p>
      ) : (
        <p role="status" className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-950" data-testid="pre-session-clear">
          The latest readings are taken and none is flagged. Take them again today.
        </p>
      )}
      <p className="mt-2 text-xs font-semibold text-slate-800">Ask first</p>
      <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-800">
        {CARDIO_DO_NOT_EXERCISE_SYMPTOMS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-slate-700">Any of these, or a flagged reading: do not exercise or test today, and contact the patient&apos;s doctor.</p>
      {setup && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => setOpen(true)}
            data-testid="safety-check-open"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
          >
            <i aria-hidden className="fa-solid fa-clipboard-check text-xs" />
            Take the readings
          </button>
          <RecordTestButton setup={setup} measureKey="six_minute_walk" label="Start the six-minute walk" icon="fa-person-walking" primary />
        </div>
      )}
      {open && setup && <SafetyCheckDialog setup={setup} onClose={() => setOpen(false)} />}
    </section>
  );
}
