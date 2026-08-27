"use client";

import { useState } from "react";
import {
  mergeIntakeQuestionOverrides,
  questionsForSpecialty,
  type IntakeQuestionOverrideRow,
} from "@/lib/conditionIntake";
import type { ConditionSpecialty } from "@/lib/conditionSpecialty";

// Admin edits one specialty's Patient Care Intake question wording and
// toggles which questions are mandatory — same per-row save pattern as
// PainMapQuestionEditor, plus a required checkbox since that's editable
// here (Pain Map has no per-question required concept).
//
// One specialty at a time, chosen by the tabs in IntakeQuestionBank: all
// three sets stacked is twenty-odd rows of textareas, which is the
// wall-of-fields shape this codebase keeps correcting.
export default function IntakeQuestionEditor({
  specialty,
  overrideRows,
}: {
  specialty: ConditionSpecialty;
  overrideRows: IntakeQuestionOverrideRow[];
}) {
  const questions = mergeIntakeQuestionOverrides(
    questionsForSpecialty(specialty),
    overrideRows,
    specialty
  );

  return (
    <div className="space-y-3">
      {questions.map((q) => (
        <QuestionRow
          key={q.key}
          specialty={specialty}
          questionKey={q.key}
          text={q.label}
          required={q.required}
        />
      ))}
    </div>
  );
}

function QuestionRow({
  specialty,
  questionKey,
  text,
  required,
}: {
  specialty: ConditionSpecialty;
  questionKey: string;
  text: string;
  required: boolean;
}) {
  const [value, setValue] = useState(text);
  const [isRequired, setIsRequired] = useState(required);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = value !== text || isRequired !== required;

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    const res = await fetch("/api/admin/intake-questions/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ specialty, questionKey, questionText: value, required: isRequired }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save.");
    }
  }

  return (
    <div className="flex items-start gap-2">
      <div className="flex-1">
        <label className="block text-[11px] font-semibold text-slate-500 mb-1">{questionKey}</label>
        <textarea
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          rows={1}
          className="w-full p-2 rounded-lg border border-slate-300 text-sm"
        />
        <label className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-600">
          <input
            type="checkbox"
            checked={isRequired}
            onChange={(e) => {
              setIsRequired(e.target.checked);
              setSaved(false);
            }}
          />
          Required
        </label>
        {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
      </div>
      <button
        onClick={handleSave}
        disabled={saving || !dirty}
        className="mt-6 shrink-0 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white text-xs font-semibold px-3 py-2 rounded-lg transition"
      >
        {saving ? "Saving..." : saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
