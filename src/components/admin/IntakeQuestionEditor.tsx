"use client";

import { useState } from "react";
import { INTAKE_QUESTIONS, mergeIntakeQuestionOverrides, type IntakeQuestionOverrideRow } from "@/lib/conditionIntake";

// Admin edits Patient Care Intake question wording and toggles which
// questions are mandatory — same per-row save pattern as
// PainMapQuestionEditor, plus a required checkbox since that's editable
// here (Pain Map has no per-question required concept).
export default function IntakeQuestionEditor({
  overrideRows,
}: {
  overrideRows: IntakeQuestionOverrideRow[];
}) {
  const questions = mergeIntakeQuestionOverrides(INTAKE_QUESTIONS, overrideRows);

  return (
    <div className="space-y-3">
      {questions.map((q) => (
        <QuestionRow key={q.key} questionKey={q.key} text={q.label} required={q.required} />
      ))}
    </div>
  );
}

function QuestionRow({
  questionKey,
  text,
  required,
}: {
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
      body: JSON.stringify({ questionKey, questionText: value, required: isRequired }),
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
