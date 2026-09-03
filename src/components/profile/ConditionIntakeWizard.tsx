"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { AnimatePresence, motion } from "motion/react";
import AreaPainPicker from "@/components/profile/AreaPainPicker";
import {
  countAnswered,
  findMissingRequiredKeys,
  countedQuestions,
  isAnswered,
  parseAreaPain,
  parseMultiSelect,
  serializeMultiSelect,
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
  extraPayload,
  voice = "patient",
  draftEndpoint,
  patientId,
  initialData,
  onClose,
  onSubmitted,
}: {
  questions: IntakeQuestion[];
  endpoint: string;
  /** Extra fields merged into both the submit and the draft body. The
   *  therapist's onboarding flow uses it to carry `{ specialty,
   *  triageData }` -- two lines here rather than teaching the wizard what
   *  a specialty is. */
  extraPayload?: Record<string, unknown>;
  /** Who is holding the screen. The same wizard now serves two people:
   *  the patient editing their own record, and the therapist filling it
   *  in with them at the first session. The copy cannot be true for both
   *  -- "your therapist reads this before your first session" is false
   *  when the therapist is typing it during that session, and "an admin
   *  checks it first" is false on the onboarding path, which writes
   *  live. */
  voice?: "patient" | "clinician";
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
  const clinician = voice === "clinician";
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

  const missingRequiredKeys = findMissingRequiredKeys(questions, values);
  const reviewStep = questions.length + 1;
  const answeredCount = countAnswered(questions, values);
  // What the person is told they are doing: seven questions, whatever the
  // key count is. A pre-step is asked but not counted.
  const countedTotal = countedQuestions(questions).length;

  // "Question 3 of 7", counting only the questions the person was told
  // there were. A pre-step (the paediatric caregiver pair) is asked but not
  // numbered -- numbering it made the header say "of 9" one screen after
  // the intro promised seven.
  function questionNumberLabel(atStep: number): string {
    const q = questions[atStep - 1];
    if (!q) return "";
    if (q.excludeFromCount) return "Before we start";
    const position = countedQuestions(questions.slice(0, atStep)).length;
    return `Question ${position} of ${countedTotal}`;
  }

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
  // Guards the SUBMIT, not the autosave. `isPending` from useTransition
  // drives the button's `disabled`, and a disabled attribute lands a
  // render too late -- three clicks inside one frame all got through and
  // all three reached the server. Same synchronous-ref pattern as
  // PatientSuggestionCard and SuggestSessionControl.
  const submittingRef = useRef(false);
  const queuedValuesRef = useRef<Record<string, string> | null>(null);
  // Held in a ref rather than in fireAutosave's dependency array: callers
  // pass a fresh object literal each render, so depending on it would
  // rebuild the callback every render and restart the debounce every
  // keystroke -- the opposite of what an autosave debounce is for.
  const extraPayloadRef = useRef(extraPayload);
  extraPayloadRef.current = extraPayload;

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
        body: JSON.stringify({
          ...extraPayloadRef.current,
          ...(patientId ? { patientId } : {}),
          data: vals,
        }),
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
    if (submittingRef.current) return;
    submittingRef.current = true;
    startTransition(async () => {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...extraPayload, ...(patientId ? { patientId } : {}), data: values }),
        });
        if (res.ok) {
          onSubmitted?.();
          router.refresh();
          onClose();
          return;
        }
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not submit. Please try again.");
      } catch {
        // A rejected fetch -- offline, DNS, a dead tunnel. This used to
        // fall out of the transition unhandled, so the button returned to
        // its resting label and said nothing: a clinician was left
        // believing a clinical record had saved when it had not. Never
        // clear the answers here; the person keeps exactly what they typed.
        setError("Could not reach the clinic — check your connection and try again. Nothing you typed has been lost.");
      } finally {
        // Released on failure so they can retry. On success the dialog has
        // already closed and unmounted.
        submittingRef.current = false;
      }
    });
  }

  // Measured on the questions, not on the screens: counting the intro and
  // the review step made the bar disagree with the "Question N of M"
  // printed directly beside it.
  const answeredSoFar = countedQuestions(questions.slice(0, Math.max(step, 0))).length;
  const progressPercent =
    countedTotal === 0 ? 0 : Math.round((Math.min(answeredSoFar, countedTotal) / countedTotal) * 100);

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
                      : questionNumberLabel(step)}
                </p>
                <h2 id="intake-wizard-title" className="text-lg font-bold text-slate-800">
                  {clinician ? "Their health profile" : "Your health profile"}
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
                  {clinician
                    ? `${countedTotal} short questions to go through together.`
                    : `${countedTotal} short questions about your condition.`}
                </p>
                <p>
                  {clinician
                    ? "Ask them in the patient's own words and record what they say. This goes straight onto their chart and is what opens their health profile to them."
                    : "This is your own account of your condition, in your words. Only your therapist and the clinic read it. It takes about two minutes."}
                </p>
                <ul className="space-y-2">
                  <li className="flex gap-2">
                    <span aria-hidden className="text-teal-600">
                      •
                    </span>
                    <span>
                      {clinician
                        ? "One question at a time — record their answer in their own words."
                        : "One question at a time — answer in your own words, no medical terms needed."}
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span aria-hidden className="text-teal-600">
                      •
                    </span>
                    <span>
                      Stop any time. Everything you type is saved, and you can pick up where you left
                      off.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span aria-hidden className="text-teal-600">
                      •
                    </span>
                    <span>
                      {clinician
                        ? "This opens their health profile to them, and they can add to it afterwards."
                        : "You can change any of these later."}
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
                  {question.required
                    ? "Needed"
                    : clinician
                      ? "Optional — leave it if they're not sure"
                      : "Optional — skip it if you're not sure"}
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
                      {/* The endpoints come from the question, not from
                          the component: this control serves the ortho pain
                          score AND the neurological independence score,
                          which run in opposite directions. Hardcoding
                          "no pain / worst imaginable" would have told a
                          stroke patient that being independent is the
                          worst outcome. */}
                      <div className="mt-1.5 flex justify-between text-[11px] font-semibold text-slate-400">
                        <span>{scaleEnds(question)[0]}</span>
                        <span>{scaleEnds(question)[1]}</span>
                      </div>
                    </div>
                  ) : question.inputType === "select" ? (
                    // Tappable options rather than a <select>: on a phone a
                    // native picker hides every choice behind one tap, and
                    // these lists are short enough to read at once.
                    <div className="grid gap-2">
                      {(question.options ?? []).map((option) => {
                        const selected = values[question.key] === option;
                        return (
                          <button
                            key={option}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setValues((v) => ({ ...v, [question.key]: option }))}
                            className={`rounded-xl border px-3.5 py-3 text-left text-sm font-semibold transition ${
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
                  ) : question.inputType === "multi_select" ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(question.options ?? []).map((option) => {
                        const picked = parseMultiSelect(values[question.key]);
                        const selected = picked.includes(option);
                        return (
                          <button
                            key={option}
                            type="button"
                            aria-pressed={selected}
                            onClick={() =>
                              setValues((v) => ({
                                ...v,
                                [question.key]: serializeMultiSelect(
                                  selected
                                    ? picked.filter((p) => p !== option)
                                    : [...picked, option]
                                ),
                              }))
                            }
                            className={`flex items-center gap-2 rounded-xl border px-3.5 py-3 text-left text-sm font-semibold transition ${
                              selected
                                ? "border-teal-700 bg-teal-50 text-teal-800"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                            }`}
                          >
                            <span
                              aria-hidden
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[9px] ${
                                selected
                                  ? "border-teal-700 bg-teal-700 text-white"
                                  : "border-slate-300 bg-white"
                              }`}
                            >
                              {selected && <i className="fa-solid fa-check" />}
                            </span>
                            {option}
                          </button>
                        );
                      })}
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
                  {clinician
                    ? "Check this over with the patient before you send it. It goes onto their chart straight away — no waiting on a review — and opens their health profile to them."
                    : "Here's what you told us. Change anything that doesn't look right, then send it in — the clinic checks it before it goes on your record."}
                </p>
                {missingRequiredKeys.length > 0 && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-800">
                    <span className="font-semibold">Still needed: </span>
                    {missingRequiredKeys
                      .map((key) => {
                        const q = questions.find((item) => item.key === key);
                        return (q?.shortLabel ?? q?.label ?? key).toLowerCase();
                      })
                      .join(", ")}
                    . Tap Edit on those to fill them in — everything else is already saved.
                  </p>
                )}
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
            <div className="flex min-w-0 items-center gap-4">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  className="text-sm font-semibold text-slate-500 transition hover:text-slate-800"
                >
                  Back
                </button>
              )}
              {step > 0 && step < reviewStep && draftEndpoint && (
                <button
                  type="button"
                  onClick={close}
                  className="text-xs font-semibold text-slate-400 transition hover:text-slate-600"
                >
                  Finish later
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              {draftEndpoint && (
                // Says the same thing whether or not a save has landed
                // yet: the fear this answers is "will I lose this if I
                // close it", and that has to be answered before the
                // patient closes it, not after the first autosave.
                <span className="hidden text-[11px] text-slate-400 sm:inline">
                  {draftSavedAt ? `Saved ${draftSavedAt.toLocaleTimeString()}` : "Saves as you type"}
                </span>
              )}
              {step === reviewStep ? (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isPending}
                  className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-50"
                >
                  {isPending ? "Saving..." : clinician ? "Save to their chart" : "Send for review"}
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

/** The two ends of a 0-10 scale, in that question's own terms. Derived
 *  from the label rather than hardcoded, because this control is shared by
 *  scores that run in opposite directions -- ten is the bad end of a pain
 *  score and the good end of an independence score. */
function scaleEnds(question: IntakeQuestion): [string, string] {
  const match = question.label.match(/\(\s*0\s*=\s*([^,]+),\s*10\s*=\s*([^)]+)\)/i);
  if (match) return [`0 — ${match[1].trim()}`, `10 — ${match[2].trim()}`];
  return ["0", "10"];
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
  if (question.inputType === "multi_select") {
    const picked = parseMultiSelect(value);
    if (picked.length === 0) return <span className="text-slate-400">Not answered</span>;
    return <>{picked.join(", ")}</>;
  }
  if (!value || !value.trim()) return <span className="text-slate-400">Not answered</span>;
  if (question.inputType === "scale_0_10") return <>{value}/10</>;
  return <span className="whitespace-pre-wrap">{value}</span>;
}
