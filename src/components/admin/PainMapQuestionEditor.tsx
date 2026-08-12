"use client";

import { useState } from "react";
import {
  PAIN_MAP_REGIONS,
  getDefaultQuestionsForRegion,
  mergeQuestionOverrides,
  type PainMapRegionKey,
  type QuestionOverrideRow,
} from "@/lib/painMap";

// Admin edits a single Pain Map question's wording for one region. Only
// question_text is editable (see the API route's own comment for why
// input type / order stay code-defined). Loads all overrides once so
// switching the region dropdown doesn't need another round trip.
export default function PainMapQuestionEditor({
  overridesByRegion,
}: {
  overridesByRegion: Record<string, QuestionOverrideRow[]>;
}) {
  const [region, setRegion] = useState<PainMapRegionKey>(PAIN_MAP_REGIONS[0].key);
  const questions = mergeQuestionOverrides(
    getDefaultQuestionsForRegion(region),
    overridesByRegion[region] ?? []
  );

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">Region</label>
      <select
        value={region}
        onChange={(e) => setRegion(e.target.value as PainMapRegionKey)}
        className="mb-4 p-2 rounded-lg border border-slate-300 text-sm"
      >
        {PAIN_MAP_REGIONS.map((r) => (
          <option key={r.key} value={r.key}>
            {r.label}
          </option>
        ))}
      </select>
      <div className="space-y-3">
        {questions.map((q) => (
          <QuestionRow key={q.key} region={region} questionKey={q.key} text={q.text} />
        ))}
      </div>
    </div>
  );
}

function QuestionRow({
  region,
  questionKey,
  text,
}: {
  region: string;
  questionKey: string;
  text: string;
}) {
  const [value, setValue] = useState(text);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    const res = await fetch("/api/admin/pain-map-questions/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ region, questionKey, questionText: value }),
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
        {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
      </div>
      <button
        onClick={handleSave}
        disabled={saving || value === text}
        className="mt-6 shrink-0 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white text-xs font-semibold px-3 py-2 rounded-lg transition"
      >
        {saving ? "Saving..." : saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
