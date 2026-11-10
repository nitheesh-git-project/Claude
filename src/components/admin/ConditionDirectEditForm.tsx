"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { visibleQuestions, type IntakeQuestion } from "@/lib/conditionIntake";
import AreaPainPicker from "@/components/profile/AreaPainPicker";
import { useConfirm } from "@/lib/useConfirm";
import { useToast } from "@/lib/toast";
import { diffIntakeAnswers, describeAnswerChanges } from "@/lib/intakeAnswerDiff";
import { PAIN_MAP_REGIONS } from "@/lib/painMap";

const regionLabel = (region: string) => PAIN_MAP_REGIONS.find((r) => r.key === region)?.label ?? region;

/**
 * Editing a patient's live intake answers from the back office.
 *
 * Nothing is editable until "Edit answers" is pressed -- the answers are what
 * the whole Health Profile is built from, and a form that is always open is
 * one stray keystroke from a change that applies with no review. Saving shows
 * exactly what will change (before -> after) and asks first.
 */
export default function ConditionDirectEditForm({
  questions,
  patientId,
  patientName = "the patient",
  currentData,
  disabled,
}: {
  questions: IntakeQuestion[];
  patientId: string;
  patientName?: string;
  currentData: Record<string, string>;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const q of questions) initial[q.key] = currentData[q.key] ?? "";
    return initial;
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const { show } = useToast();

  // Always start from what is live now, not from what the page held when it
  // first rendered: after a save the refresh hands this new answers.
  function startEditing() {
    const fresh: Record<string, string> = {};
    for (const q of questions) fresh[q.key] = currentData[q.key] ?? "";
    setValues(fresh);
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    setError(null);
    setSaved(false);
    const changes = diffIntakeAnswers(questions, currentData, values, regionLabel);
    if (changes.length === 0) {
      setError("Nothing has changed yet.");
      return;
    }
    // Awaited before the transition, never inside it (frontend.md).
    if (
      !(await confirm(describeAnswerChanges(patientName, changes), {
        confirmLabel: "Save changes",
        cancelLabel: "Keep editing",
      }))
    ) {
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/admin/condition-requests/direct-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, data: values }),
      });
      if (res.ok) {
        setSaved(true);
        setEditing(false);
        show(`${changes.length} change${changes.length === 1 ? "" : "s"} saved to ${patientName}'s Health Profile`);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not save. Please try again.");
      }
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={startEditing}
          disabled={disabled}
          className="bg-white hover:bg-slate-50 disabled:opacity-60 border border-slate-300 text-slate-800 text-xs font-semibold px-4 py-2 rounded-lg transition"
        >
          Edit answers
        </button>
        {disabled && (
          <span className="text-xs text-amber-700">
            Decide the submission waiting above first, so the two don&apos;t overwrite each other.
          </span>
        )}
        {saved && <span className="text-[11px] text-emerald-600">Saved.</span>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {dialog}
      {disabled && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          A submission is pending review above -- approve or decline it before editing directly, so the two
          don&apos;t overwrite each other.
        </p>
      )}
      {/* Only the questions these answers ask (the Parkinson's follow-ups
          open when the condition group says so); a closed one keeps its
          stored answer and is sent back unchanged. */}
      {visibleQuestions(questions, values).map((q) => (
        <div key={q.key}>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            {q.label}
            {q.required && <span className="text-red-500"> *</span>}
          </label>
          {q.inputType === "area_pain_list" ? (
            <AreaPainPicker
              label={q.label}
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
              className="w-full p-2 rounded-lg border border-slate-300 text-sm disabled:bg-slate-50 disabled:text-slate-500"
            />
          ) : (
            <input
              type={q.inputType === "scale_0_10" ? "number" : "text"}
              min={q.inputType === "scale_0_10" ? 0 : undefined}
              max={q.inputType === "scale_0_10" ? 10 : undefined}
              value={values[q.key]}
              onChange={(e) => setValues((v) => ({ ...v, [q.key]: e.target.value }))}
              disabled={disabled}
              className="w-full p-2 rounded-lg border border-slate-300 text-sm disabled:bg-slate-50 disabled:text-slate-500"
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
          {isPending ? "Saving..." : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={isPending}
          className="bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold px-4 py-2 rounded-lg transition"
        >
          Cancel
        </button>
        {saved && <span className="text-[11px] text-emerald-600">Saved.</span>}
        {error && <span className="text-[11px] text-red-600">{error}</span>}
      </div>
    </div>
  );
}
