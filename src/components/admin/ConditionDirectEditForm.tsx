"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { IntakeQuestion } from "@/lib/conditionIntake";
import AreaPainPicker from "@/components/profile/AreaPainPicker";

export default function ConditionDirectEditForm({
  questions,
  patientId,
  currentData,
  disabled,
}: {
  questions: IntakeQuestion[];
  patientId: string;
  currentData: Record<string, string>;
  disabled?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const q of questions) initial[q.key] = currentData[q.key] ?? "";
    return initial;
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await fetch("/api/admin/condition-requests/direct-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, data: values }),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-3">
      {disabled && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          A submission is pending review above -- approve or decline it before editing directly, so the two
          don&apos;t overwrite each other.
        </p>
      )}
      {questions.map((q) => (
        <div key={q.key}>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            {q.label}
            {q.required && <span className="text-red-500"> *</span>}
          </label>
          {q.inputType === "area_pain_list" ? (
            <AreaPainPicker
              value={values[q.key]}
              onChange={(next) => setValues((v) => ({ ...v, [q.key]: next }))}
              disabled={disabled}
            />
          ) : q.inputType === "textarea" ? (
            <textarea
              value={values[q.key]}
              onChange={(e) => setValues((v) => ({ ...v, [q.key]: e.target.value }))}
              rows={2}
              disabled={disabled}
              className="w-full p-2 rounded-lg border border-slate-300 text-sm disabled:bg-slate-50 disabled:text-slate-400"
            />
          ) : (
            <input
              type={q.inputType === "scale_0_10" ? "number" : "text"}
              min={q.inputType === "scale_0_10" ? 0 : undefined}
              max={q.inputType === "scale_0_10" ? 10 : undefined}
              value={values[q.key]}
              onChange={(e) => setValues((v) => ({ ...v, [q.key]: e.target.value }))}
              disabled={disabled}
              className="w-full p-2 rounded-lg border border-slate-300 text-sm disabled:bg-slate-50 disabled:text-slate-400"
            />
          )}
        </div>
      ))}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleSave}
          disabled={isPending || disabled}
          className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
        {saved && <span className="text-[11px] text-emerald-600">Saved.</span>}
        {error && <span className="text-[11px] text-red-600">{error}</span>}
      </div>
    </div>
  );
}
