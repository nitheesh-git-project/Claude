"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { INTAKE_QUESTIONS } from "@/lib/conditionIntake";

// Shared by the patient's own Health Profile page and a therapist's
// on-behalf fill (once their access grant is approved) — same form, just
// a different submit endpoint and, for the therapist, an explicit
// patientId. Both submissions land in condition_change_requests and wait
// for admin review; see the API routes for the actual gating.
export default function ConditionIntakeForm({
  endpoint,
  patientId,
  currentData,
  disabled,
}: {
  endpoint: string;
  patientId?: string;
  currentData: Record<string, string>;
  disabled: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const q of INTAKE_QUESTIONS) initial[q.key] = currentData[q.key] ?? "";
    return initial;
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const router = useRouter();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patientId ? { patientId, data: values } : { data: values }),
      });
      if (res.ok) {
        setSubmitted(true);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not submit. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {INTAKE_QUESTIONS.map((q) => (
        <div key={q.key}>
          <label className="block text-sm font-semibold text-slate-700 mb-1">{q.label}</label>
          {q.inputType === "textarea" ? (
            <textarea
              value={values[q.key]}
              onChange={(e) => setValues((v) => ({ ...v, [q.key]: e.target.value }))}
              rows={3}
              disabled={disabled}
              className="w-full p-2.5 rounded-lg border border-slate-300 text-sm disabled:bg-slate-50 disabled:text-slate-400"
            />
          ) : (
            <input
              type={q.inputType === "scale_0_10" ? "number" : "text"}
              min={q.inputType === "scale_0_10" ? 0 : undefined}
              max={q.inputType === "scale_0_10" ? 10 : undefined}
              value={values[q.key]}
              onChange={(e) => setValues((v) => ({ ...v, [q.key]: e.target.value }))}
              disabled={disabled}
              className="w-full p-2.5 rounded-lg border border-slate-300 text-sm disabled:bg-slate-50 disabled:text-slate-400"
            />
          )}
        </div>
      ))}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleSubmit}
          disabled={disabled || isPending}
          className="bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition"
        >
          {isPending ? "Submitting..." : "Submit for review"}
        </button>
        {submitted && !error && (
          <span className="text-xs text-emerald-600">Submitted — waiting for admin review.</span>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
