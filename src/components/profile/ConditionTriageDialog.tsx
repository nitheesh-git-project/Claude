"use client";

import { useMemo, useState } from "react";
import {
  findMissingRequiredKeys,
  parseMultiSelect,
  serializeMultiSelect,
  type IntakeQuestion,
} from "@/lib/conditionIntake";
import {
  CONDITION_SPECIALTIES,
  TRIAGE_QUESTIONS,
  suggestSpecialtyFromTriage,
  type ConditionSpecialty,
} from "@/lib/conditionSpecialty";

/**
 * Triage: the four questions a therapist asks at first contact, and the
 * choice of which condition type this patient's record is.
 *
 * All at once with headings, not one question at a time. That inverts the
 * pacing of ConditionIntakeWizard on purpose and for the reason
 * PainExamDialog documents: a patient fills their intake once and needs
 * gentleness; a clinician fills this after every assignment and needs
 * speed. Never a wall of fields for either — different treatment for
 * different audiences.
 *
 * The suggestion is shown WITH its reason. A suggestion whose reasoning a
 * clinician cannot see is one they learn to ignore, and this one is only
 * ever a suggestion: it arrives pre-selected but is never auto-accepted,
 * because deciding what kind of patient this is is the therapist's call.
 */
export default function ConditionTriageDialog({
  currentSpecialty,
  enabledSpecialties,
  initialTriage,
  onCancel,
  onConfirm,
}: {
  /** What the profile is now, or null on a first onboarding. */
  currentSpecialty: ConditionSpecialty | null;
  enabledSpecialties: ConditionSpecialty[];
  initialTriage?: Record<string, string>;
  onCancel: () => void;
  onConfirm: (specialty: ConditionSpecialty, triageData: Record<string, string>) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(TRIAGE_QUESTIONS.map((q) => [q.key, initialTriage?.[q.key] ?? ""]))
  );
  const [picked, setPicked] = useState<ConditionSpecialty | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only questions whose condition is met. `showWhen` exists for triage
  // alone -- a patient-facing set that hides questions cannot honestly say
  // "N of 7".
  const visibleQuestions = useMemo(
    () =>
      TRIAGE_QUESTIONS.filter(
        (q) => !q.showWhen || answers[q.showWhen.key] === q.showWhen.equals
      ),
    [answers]
  );

  const missing = findMissingRequiredKeys(visibleQuestions, answers);
  const ready = missing.length === 0;
  const suggestion = ready ? suggestSpecialtyFromTriage(answers) : null;
  const effectivePick = picked ?? suggestion?.suggested ?? null;

  // A specialty switched off in Settings is not offered -- except the one
  // this profile already has, so turning pediatrics off cannot strand an
  // existing paediatric patient whose record needs re-triaging.
  const offered = CONDITION_SPECIALTIES.filter(
    (s) => enabledSpecialties.includes(s.key) || s.key === currentSpecialty
  );

  function handleContinue() {
    if (!ready) {
      setError("Answer the questions above first.");
      return;
    }
    if (!effectivePick) {
      setError("Pick a condition type.");
      return;
    }
    // Only the questions actually shown are stored: a hidden
    // development_concern would otherwise be saved as an empty string and
    // read later as "asked, answered blank".
    const triageData = Object.fromEntries(
      visibleQuestions.map((q) => [q.key, answers[q.key] ?? ""]).filter(([, v]) => v)
    );
    onConfirm(effectivePick, triageData);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-teal-700">
              {currentSpecialty ? "Changing the condition type" : "Patient onboarding"}
            </p>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Which condition type is this?
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Four questions, then pick one. It decides which set of questions the patient answers
              and what their health profile shows.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="shrink-0 text-slate-400 transition hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {visibleQuestions.map((question) => (
            <TriageQuestion
              key={question.key}
              question={question}
              value={answers[question.key] ?? ""}
              onChange={(next) => {
                setAnswers((a) => ({ ...a, [question.key]: next }));
                setError(null);
                // The suggestion moves with the answers until the
                // clinician overrides it; once they have picked, their
                // pick stands.
              }}
            />
          ))}

          <div className="border-t border-slate-100 pt-5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Condition type
            </p>
            {suggestion ? (
              <p className="mt-1.5 flex items-start gap-2 rounded-xl bg-teal-50/70 px-3.5 py-3 text-sm leading-relaxed text-teal-900">
                <i aria-hidden className="fa-solid fa-lightbulb mt-0.5 text-xs text-teal-600" />
                <span>
                  <span className="font-semibold">
                    Suggested:{" "}
                    {CONDITION_SPECIALTIES.find((s) => s.key === suggestion.suggested)?.label}
                  </span>{" "}
                  — {suggestion.because} Change it if you disagree.
                </span>
              </p>
            ) : (
              <p className="mt-1.5 text-sm text-slate-500">
                Answer the questions above and a suggestion appears here.
              </p>
            )}

            <div className="mt-3 grid gap-2">
              {offered.map((s) => {
                const selected = effectivePick === s.key;
                const isCurrent = s.key === currentSpecialty;
                return (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setPicked(s.key);
                      setError(null);
                    }}
                    className={`rounded-xl border px-4 py-3 text-left transition ${
                      selected
                        ? "border-teal-700 bg-teal-50/60 ring-1 ring-teal-700"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <i aria-hidden className={`fa-solid ${s.icon} text-xs text-slate-500`} />
                      <span className="text-sm font-bold text-slate-800">{s.label}</span>
                      {isCurrent && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          Current
                        </span>
                      )}
                      {suggestion?.suggested === s.key && !isCurrent && (
                        <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-700">
                          Suggested
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">{s.blurb}</span>
                  </button>
                );
              })}
            </div>

            {/* Stated on the first pass as well as on a change. The
                reassurance used to render only once a condition type
                existed -- silent at the one moment the decision is
                actually being made. */}
            <p className="mt-3 text-xs text-slate-500">
              {currentSpecialty
                ? `Their answers to the ${CONDITION_SPECIALTIES.find((s) => s.key === currentSpecialty)?.label.toLowerCase()} questions stay on file — they just stop being shown.`
                : "You can change this later if the case turns out to be something else; nothing answered is ever lost."}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
          {error ? (
            <p className="text-xs font-semibold text-red-600">{error}</p>
          ) : (
            <span className="text-xs text-slate-400">
              Your answers save as you go — you can close this and come back.
            </span>
          )}
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleContinue}
              disabled={!ready || !effectivePick}
              className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-50"
            >
              Continue to the questions
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TriageQuestion({
  question,
  value,
  onChange,
}: {
  question: IntakeQuestion;
  value: string;
  onChange: (next: string) => void;
}) {
  const options = question.options ?? [];

  return (
    <div>
      <p className="text-sm font-bold text-slate-800">
        {question.label}
        {question.required && <span className="ml-1 text-red-500">*</span>}
      </p>
      {question.helpText && (
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{question.helpText}</p>
      )}

      {question.inputType === "multi_select" ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {options.map((option) => {
            const picked = parseMultiSelect(value);
            const selected = picked.includes(option);
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  onChange(
                    serializeMultiSelect(
                      selected ? picked.filter((p) => p !== option) : [...picked, option]
                    )
                  )
                }
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition ${
                  selected
                    ? "border-teal-700 bg-teal-50 text-teal-800"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[9px] ${
                    selected ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white"
                  }`}
                >
                  {selected && <i className="fa-solid fa-check" />}
                </span>
                {option}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {options.map((option) => {
            const selected = value === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange(option)}
                className={`rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition ${
                  selected
                    ? "border-teal-700 bg-teal-700 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
