"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PAIN_MAP_REGIONS,
  regionRequiresSide,
  getDefaultQuestionsForRegion,
  mergeQuestionOverrides,
  type PainMapRegionKey,
  type QuestionOverrideRow,
} from "@/lib/painMap";

// Therapist's per-region clinical exam entry. Posts straight to
// pain_assessments — no admin review step (see the schema.sql section
// comment) — so this is live on the patient's dashboard the moment it's
// submitted.
export default function PainAssessmentForm({
  patientId,
  overridesByRegion,
}: {
  patientId: string;
  overridesByRegion: Record<string, QuestionOverrideRow[]>;
}) {
  const [region, setRegion] = useState<PainMapRegionKey>(PAIN_MAP_REGIONS[0].key);
  const [side, setSide] = useState<"left" | "right">("left");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [painPercent, setPainPercent] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const router = useRouter();

  const needsSide = regionRequiresSide(region);
  const questions = mergeQuestionOverrides(
    getDefaultQuestionsForRegion(region),
    overridesByRegion[region] ?? []
  );

  function handleRegionChange(next: PainMapRegionKey) {
    setRegion(next);
    setAnswers({});
    setSubmitted(false);
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/therapist/pain-assessments/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          region,
          side: needsSide ? side : undefined,
          answers: Object.entries(answers).map(([key, value]) => ({ key, value })),
          painPercent,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        setAnswers({});
        setPainPercent(0);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not submit. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Region</label>
          <select
            value={region}
            onChange={(e) => handleRegionChange(e.target.value as PainMapRegionKey)}
            className="p-2 rounded-lg border border-slate-300 text-sm"
          >
            {PAIN_MAP_REGIONS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        {needsSide && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Side</label>
            <select
              value={side}
              onChange={(e) => setSide(e.target.value as "left" | "right")}
              className="p-2 rounded-lg border border-slate-300 text-sm"
            >
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {questions.map((q) => (
          <div key={q.key}>
            <label className="block text-xs font-semibold text-slate-600 mb-1">{q.text}</label>
            {q.inputType === "select" ? (
              <select
                value={answers[q.key] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                className="w-full p-2 rounded-lg border border-slate-300 text-sm"
              >
                <option value="">— Select —</option>
                {q.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : q.inputType === "yes_no" ? (
              <select
                value={answers[q.key] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                className="w-full p-2 rounded-lg border border-slate-300 text-sm"
              >
                <option value="">— Select —</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            ) : q.inputType === "scale_0_10" ? (
              <input
                type="number"
                min={0}
                max={10}
                value={answers[q.key] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                className="w-full p-2 rounded-lg border border-slate-300 text-sm"
              />
            ) : (
              <input
                type="text"
                value={answers[q.key] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                className="w-full p-2 rounded-lg border border-slate-300 text-sm"
              />
            )}
          </div>
        ))}
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">
          Overall pain % for this region — {painPercent}%
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={painPercent}
          onChange={(e) => setPainPercent(Number(e.target.value))}
          className="w-full"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={isPending}
          className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition"
        >
          {isPending ? "Saving..." : "Save assessment"}
        </button>
        {submitted && !error && <span className="text-xs text-emerald-600">Saved — live on the patient&apos;s dashboard.</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
