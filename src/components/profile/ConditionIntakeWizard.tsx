"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import AreaPainPicker from "@/components/profile/AreaPainPicker";
import {
  countAnswered,
  findMissingRequiredKeys,
  isAnswered,
  parseAreaPain,
  type IntakeQuestion,
} from "@/lib/conditionIntake";
import { PAIN_MAP_REGIONS } from "@/lib/painMap";

const AUTOSAVE_DELAY_MS = 1500;

// The one implementation of the Patient Care Intake fill, shared by the
// patient's own Health Profile and a therapist's on-behalf fill (once
// their access grant is approved) -- same wizard, just a different
// submit/draft endpoint and, for the therapist, an explicit patientId.
// Both submissions land in condition_change_requests and wait for admin
// review; see the API routes for the actual gating.
//
// It is a pop-up asking ONE question per screen rather than a single long
// form: patients arriving here are in pain and mostly on a phone, and a
// seven-field wall read as paperwork to be abandoned rather than as
// questions to be answered. One question at a time leaves room for the
// plain-language help text that says why each answer matters, which is
// what actually gets an honest answer instead of a blank field.
//
// `questions` is the caller's already-merged list (code defaults +
// intake_question_templates overrides -- see mergeIntakeQuestionOverrides),
// not a static import, so wording/required edits from the admin question
// bank show up here without a deploy.
//
// Answers autosave to draftEndpoint (debounced) as the wizard is filled,
// so closing mid-way -- which is far likelier here, since the pop-up can
// be dismissed at any step -- doesn't lose progress. See the save-draft
// routes and patient_condition_profiles.draft_data.
export default function ConditionIntakeWizard({
  questions,
  endpoint,
  draftEndpoint,
  patientId,
  initialData,
  onClose,
  onSubmitted,
}: {
  questions: IntakeQuestion[];
  endpoint: string;
  draftEndpoint?: string;
  patientId?: string;
  initialData: Record<string, string>;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const q of questions) initial[q.key] = initialData[q.key] ?? "";
    return initial;
  });
  // Step 0 is the intro, 1..questions.length are the questions, the last
  // step is the review. Resume on the first unanswered question when the
  // patient already has answers to come back to, so continuing a draft
  // doesn't mean tapping Next past everything already filled in.
  const [step, setStep] = useState(() => {
    const initialCount = countAnswered(
      questions,
      questions.reduce<Record<string, string>>((acc, q) => {
        acc[q.key] = initialData[q.key] ?? "";
        return acc;
      }, {})
    );
    if (initialCount === 0) return 0;
    const firstUnanswered = questions.findIndex((q) => !isAnswered(q, initialData));
    return firstUnanswered === -1 ? questions.length + 1 : firstUnanswered + 1;
  });
  const [stepError, setStepError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const router = useRouter();

  const reviewStep = questions.length + 1;
  const totalSteps = reviewStep + 1;
  const answeredCount = countAnswered(questions, values);

  const dialogRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextAutosave = useRef(true); // don't autosave the initial prefill
  // Autosave sends a full snapshot every debounce cycle, not a diff. With
  // more than one save in flight at once, network jitter can let an
  // earlier cycle's response land after a later one's and silently
  // overwrite draft_data with older text. Serializing to at most one
  // in-flight request -- queueing the newest values instead of firing a
  // second request -- means there's never a pair of responses left to
  // race, so whichever one is in flight is always superseded by the very
  // next save rather than clobbered by it.
  const savingRef = useRef(false);
  const queuedValuesRef = useRef<Record<string, string> | null>(null);

  const fireAutosave = useCallback(
    function save(vals: Record<string, string>) {
      if (!draftEndpoint) return;
      if (savingRef.current) {
        queuedValuesRef.current = vals;
        return;
      }
      savingRef.current = true;
      fetch(draftEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patientId ? { patientId, data: vals } : { data: vals }),
      })
        .then((res) => {
          if (res.ok) setDraftSavedAt(new Date());
        })
        .catch(() => {})
        .finally(() => {
          savingRef.current = false;
          const next = queuedValuesRef.current;
          if (next) {
            queuedValuesRef.current = null;
            save(next);
          }
        });
    },
    [draftEndpoint, patientId]
  );

  useEffect(() => {
    if (!draftEndpoint) return;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => fireAutosave(values), AUTOSAVE_DELAY_MS);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [values, draftEndpoint, fireAutosave]);

  // Closing mid-answer must not lose the last few keystrokes: the
  // debounce timer may still be pending, so flush it on the way out.
  const close = useCallback(() => {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
      if (!skipNextAutosave.current) fireAutosave(values);
    }
    onClose();
  }, [fireAutosave, onClose, values]);

  useEffect(() => {
    lastFocused.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      lastFocused.current?.focus?.();
    };
  }, [close]);

  // Each step is a fresh screen, so move focus to it on every change --
  // otherwise a keyboard or screen-reader user taps Next and stays parked
  // on a button while the question they're meant to answer scrolls in
  // silently above it.
  useEffect(() => {
    dialogRef.current?.focus();
    setStepError(null);
  }, [step]);

  const question = step >= 1 && step <= questions.length ? questions[step - 1] : null;

  function goNext() {
    if (question && question.required && !isAnswered(question, values)) {
      setStepError("This one's needed before we can go on.");
      return;
    }
    setStep((s) => Math.min(s + 1, reviewStep));
  }

  function handleSubmit() {
    setError(null);
    const missing = findMissingRequiredKeys(questions, values);
    if (missing.length > 0) {
      // Can only happen via the review step's Edit links, so send them
      // straight back to the first question still missing an answer.
      const firstIndex = questions.findIndex((q) => q.key === missing[0]);
      setStep(firstIndex + 1);
      setStepError("This one's needed before we can go on.");
      return;
    }
    startTransition(async () => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patientId ? { patientId, data: values } : { data: values }),
      });
      if (res.ok) {
        onSubmitted?.();
        router.refresh();
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not submit. Please try again.");
      }
    });
  }

  const progressPercent = Math.round((step / (totalSteps - 1)) * 100);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        // backdrop-blur-sm is the platform-wide convention for every
        // full-page pop-up -- tint AND blur, never just dim.
        className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        onClick={close}
      >
        <motion.div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="intake-wizard-title"
          initial={{ opacity: 0, y: 40, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.25 }}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl outline-none sm:max-h-[85vh] sm:rounded-2xl"
        >
          <div className="border-b border-slate-100 px-6 pt-5 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">
                  {step === 0
                    ? "Before we start"
                    : step === reviewStep
                      ? "Last look"
                      : `Question ${step} of ${questions.length}`}
                </p>
                <h2 id="intake-wizard-title" className="text-lg font-bold text-slate-800">
                  Your health profile
                </h2>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Save and close"
                className="shrink-0 text-2xl leading-none text-slate-400 transition hover:text-slate-700"
              >
                &times;
              </button>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-teal-600 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {step === 0 && (
              <div className="space-y-4 text-sm text-slate-600">
                <p className="text-base font-semibold text-slate-800">
                  {questions.length} short questions about what&apos;s hurting.
                </p>
                <p>
                  Your therapist reads this before your first session, so the time you&apos;ve paid for goes
                  into treating you instead of into questions. It takes about two minutes.
                </p>
                <ul className="space-y-2">
                  <li className="flex gap-2">
                    <span aria-hidden className="text-teal-600">
                      •
                    </span>
                    <span>One question at a time — answer in your own words, no medical terms needed.</span>
                  </li>
                  <li className="flex gap-2">
                    <span aria-hidden className="text-teal-600">
                      •
                    </span>
                    <span>Stop any time. Everything you type is saved, and you can pick up where you left off.</span>
                  </li>
                  <li className="flex gap-2">
                    <span aria-hidden className="text-teal-600">
                      •
                    </span>
                    <span>
                      Only your therapist and the clinic&apos;s admin can see your answers. You can edit them later.
                    </span>
                  </li>
                </ul>
              </div>
            )}

            {question && (
              <div>
                <label
                  htmlFor={`intake-${question.key}`}
                  className="block text-lg font-bold leading-snug text-slate-800"
                >
                  {question.label}
                </label>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  {question.required ? "Needed" : "Optional — skip it if you're not sure"}
                </p>
                {question.helpText && (
                  <p className="mt-3 rounded-xl bg-teal-50/70 px-3.5 py-3 text-sm leading-relaxed text-teal-900">
                    {question.helpText}
                  </p>
                )}
                <div className="mt-4">
                  {question.inputType === "area_pain_list" ? (
                    <AreaPainPicker
                      value={values[question.key]}
                      onChange={(next) => setValues((v) => ({ ...v, [question.key]: next }))}
                    />
                  ) : question.inputType === "scale_0_10" ? (
                    // A row of taps rather than a number field: on a phone
                    // a numeric input means a keyboard for one digit, and
                    // nothing on screen says what 0 or 10 mean.
                    <div>
                      <div className="grid grid-cols-11 gap-1">
                        {Array.from({ length: 11 }, (_, n) => {
                          const selected = values[question.key] === String(n);
                          return (
                            <button
                              key={n}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => setValues((v) => ({ ...v, [question.key]: String(n) }))}
                              className={`rounded-lg py-2.5 text-sm font-semibold transition ${
                                selected
                                  ? "bg-teal-700 text-white"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}
                            >
                              {n}
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-1.5 flex justify-between text-[11px] font-semibold text-slate-400">
                        <span>0 — no pain</span>
                        <span>10 — worst imaginable</span>
                      </div>
                    </div>
                  ) : question.inputType === "textarea" ? (
                    <textarea
                      id={`intake-${question.key}`}
                      value={values[question.key]}
                      placeholder={question.placeholder}
                      onChange={(e) => setValues((v) => ({ ...v, [question.key]: e.target.value }))}
                      rows={4}
                      autoFocus
                      className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-teal-500 focus:outline-none"
                    />
                  ) : (
                    <input
                      id={`intake-${question.key}`}
                      type="text"
                      value={values[question.key]}
                      placeholder={question.placeholder}
                      onChange={(e) => setValues((v) => ({ ...v, [question.key]: e.target.value }))}
                      autoFocus
                      className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-teal-500 focus:outline-none"
                    />
                  )}
                </div>
                {stepError && <p className="mt-2 text-xs font-semibold text-red-600">{stepError}</p>}
              </div>
            )}

            {step === reviewStep && (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Here&apos;s what you told us. Change anything that doesn&apos;t look right, then send it in — an
                  admin checks it before your therapist sees it.
                </p>
                {questions.map((q, index) => (
                  <div key={q.key} className="rounded-xl border border-slate-200 p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {q.shortLabel ?? q.label}
                      </p>
                      <button
                        type="button"
                        onClick={() => setStep(index + 1)}
                        className="shrink-0 text-xs font-semibold text-teal-700 hover:text-teal-900"
                      >
                        Edit
                      </button>
                    </div>
                    <div className="mt-1 text-sm text-slate-700">
                      <AnswerPreview question={q} value={values[q.key]} />
                    </div>
                  </div>
                ))}
                {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
            <div className="min-w-0">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  className="text-sm font-semibold text-slate-500 transition hover:text-slate-800"
                >
                  Back
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              {draftSavedAt && (
                <span className="hidden text-[11px] text-slate-400 sm:inline">
                  Saved {draftSavedAt.toLocaleTimeString()}
                </span>
              )}
              {step === reviewStep ? (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isPending}
                  className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-50"
                >
                  {isPending ? "Sending..." : "Send for review"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={goNext}
                  className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
                >
                  {step === 0
                    ? answeredCount > 0
                      ? "Continue"
                      : "Start"
                    : question && !question.required && !isAnswered(question, values)
                      ? "Skip"
                      : "Next"}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/** Renders one stored answer the way a person wrote it -- the area_pain
 *  JSON blob has to be spelled back out as regions, not shown raw. Shared
 *  by the wizard's review step and the dashboard summary card. */
export function AnswerPreview({ question, value }: { question: IntakeQuestion; value: string | undefined }) {
  if (question.inputType === "area_pain_list") {
    const areas = parseAreaPain(value);
    if (areas.length === 0) return <span className="text-slate-400">Not answered</span>;
    return (
      <>
        {areas
          .map((a) => {
            const label = PAIN_MAP_REGIONS.find((r) => r.key === a.region)?.label ?? a.region;
            const base = `${label}${a.side !== "na" ? ` (${a.side})` : ""}: ${a.pain}/10`;
            return a.note ? `${base} — "${a.note}"` : base;
          })
          .join(", ")}
      </>
    );
  }
  if (!value || !value.trim()) return <span className="text-slate-400">Not answered</span>;
  if (question.inputType === "scale_0_10") return <>{value}/10</>;
  return <span className="whitespace-pre-wrap">{value}</span>;
}
