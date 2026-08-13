"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { IntakeQuestion } from "@/lib/conditionIntake";
import AreaPainPicker from "@/components/profile/AreaPainPicker";

export default function ConditionDirectEditForm({
  questions,
  patientId,
  currentData,
}: {
  questions: IntakeQuestion[];
  patientId: string;
  currentData: Record<string, string>;
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
      {questions.map((q) => (
        <div key={q.key}>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            {q.label}
            {q.required && <span className="text-red-500"> *</span>}
          </label>
          {q.inputType === "area_pain_list" ? (
            <AreaPainPicker value={values[q.key]} onChange={(next) => setValues((v) => ({ ...v, [q.key]: next }))} />
          ) : q.inputType === "textarea" ? (
            <textarea
              value={values[q.key]}
              onChange={(e) => setValues((v) => ({ ...v, [q.key]: e.target.value }))}
              rows={2}
              className="w-full p-2 rounded-lg border border-slate-300 text-sm"
            />
          ) : (
            <input
              type={q.inputType === "scale_0_10" ? "number" : "text"}
              min={q.inputType === "scale_0_10" ? 0 : undefined}
              max={q.inputType === "scale_0_10" ? 10 : undefined}
              value={values[q.key]}
              onChange={(e) => setValues((v) => ({ ...v, [q.key]: e.target.value }))}
              className="w-full p-2 rounded-lg border border-slate-300 text-sm"
            />
          )}
        </div>
      ))}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleSave}
          disabled={isPending}
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
