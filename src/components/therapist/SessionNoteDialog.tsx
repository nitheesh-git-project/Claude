"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  SESSION_NOTE_FIELDS,
  missingRequiredNoteFields,
  type SessionNoteData,
  type SessionNoteRow,
} from "@/lib/sessionNotes";
import CarePlanFields, {
  type CarePlanDraft,
  type RecommendableOption,
} from "@/components/therapist/CarePlanFields";

/**
 * The post-session note, written in a pop-up straight after a session
 * rather than on a page of its own.
 *
 * Same reasoning as the patient's intake wizard: a therapist writing this
 * is between patients, often on a phone, and a form they have to navigate
 * to is a form that gets skipped. This opens on top of whatever they were
 * looking at and closes back to it.
 *
 * Unlike the intake wizard it is one screen, not one question per screen:
 * the writer here is a clinician filling in familiar fields, not a patient
 * being interviewed, and paging six fields would slow an expert down.
 */
export default function SessionNoteDialog({
  appointmentId,
  patientName,
  sessionLabel,
  existing,
  locked,
  hoursLeft,
  patientId,
  sessionCompleted,
  recommendable,
  recommendationNeedsApproval,
  recommendationAwaitingClinic,
  onClose,
}: {
  appointmentId: string;
  patientName: string;
  patientId: string;
  /** Whether this session has actually been marked complete. A plan is
   *  written after seeing someone, so the recommend section only appears
   *  once it has -- and the submit route re-checks, which is the real
   *  enforcement. */
  sessionCompleted: boolean;
  /** The programmes admin has cleared for recommendation. Empty means the
   *  section stays hidden rather than showing an empty picker. */
  recommendable: RecommendableOption[];
  recommendationNeedsApproval: boolean;
  recommendationAwaitingClinic: boolean;
  /** When the session was, for the dialog's own subtitle. */
  sessionLabel: string;
  existing: SessionNoteRow | null;
  /** Past its 24-hour edit window -- decided server-side (see
   *  SessionNoteButton) so it cannot disagree with the submit route. */
  locked: boolean;
  hoursLeft: number | null;
  onClose: () => void;
}) {
  const [values, setValues] = useState<SessionNoteData>(() => {
    const initial: SessionNoteData = {};
    for (const f of SESSION_NOTE_FIELDS) initial[f.key] = existing?.data?.[f.key] ?? "";
    return initial;
  });
  const [freeText, setFreeText] = useState(existing?.free_text ?? "");
  // The plan is optional and lives beside the note rather than after it:
  // the therapist is already here, having just written what happened, and
  // "what should happen next" is the same thought. A separate screen for it
  // is a screen that gets skipped.
  const [plan, setPlan] = useState<CarePlanDraft | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    lastFocused.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
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

  function handleSubmit() {
    setError(null);
    const missingKeys = missingRequiredNoteFields(values);
    if (missingKeys.length > 0) {
      setMissing(new Set(missingKeys));
      setError("Fill in what you treated, how they responded, and the plan for next time.");
      return;
    }
    setMissing(new Set());
    startTransition(async () => {
      const res = await fetch("/api/therapist/session-notes/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId, data: values, freeText }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not save the note. Please try again.");
        return;
      }

      // The plan is submitted after the note, and its failure is reported
      // separately: the note is already saved by this point, and telling a
      // therapist their note failed because the recommendation did would
      // send them back to rewrite work that is safely stored.
      if (plan) {
        const planRes = await fetch("/api/therapist/care-plan/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientId,
            appointmentId,
            offerKind: plan.offerKind,
            packageId: plan.packageId,
            handsOnRequired: plan.handsOnRequired,
            frequencyPerWeek: plan.frequencyPerWeek,
            clinicalRationale: plan.clinicalRationale,
            instructions: plan.instructions,
          }),
        });
        if (!planRes.ok) {
          const body = await planRes.json().catch(() => ({}));
          setPlanError(
            body.error ?? "Your note was saved, but the recommendation could not be sent."
          );
          router.refresh();
          return;
        }
      }

      router.refresh();
      onClose();
    });
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        onClick={close}
      >
        <motion.div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-note-title"
          initial={{ opacity: 0, y: 40, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.25 }}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl outline-none sm:max-h-[88vh] sm:rounded-2xl"
        >
          <div className="border-b border-slate-100 px-6 pt-5 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">
                  Session note · clinician only
                </p>
                <h2 id="session-note-title" className="font-display text-lg font-bold text-slate-800">
                  {patientName}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">{sessionLabel}</p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="shrink-0 text-2xl leading-none text-slate-400 transition hover:text-slate-700"
              >
                &times;
              </button>
            </div>
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
              <i aria-hidden className="fa-solid fa-lock mt-0.5 text-[10px] text-slate-400" />
              <span>
                Only you and the clinic&apos;s admin can read this. The patient never sees it — write it the
                way you would for a colleague covering your next session.
              </span>
            </p>
            {existing && !locked && hoursLeft !== null && (
              <p className="mt-2 text-[11px] font-semibold text-amber-600">
                Editable for another {hoursLeft} hour{hoursLeft === 1 ? "" : "s"}, then it locks.
              </p>
            )}
            {locked && (
              <p className="mt-2 text-[11px] font-semibold text-slate-500">
                This note is locked — it was written more than 24 hours ago.
              </p>
            )}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {SESSION_NOTE_FIELDS.map((field) => {
              const isMissing = missing.has(field.key);
              const inputClass = `w-full rounded-xl border p-3 text-sm focus:outline-none disabled:bg-slate-50 disabled:text-slate-500 ${
                isMissing ? "border-red-400" : "border-slate-300 focus:border-teal-500"
              }`;
              return (
                <div key={field.key}>
                  <label
                    htmlFor={`note-${field.key}`}
                    className="block text-sm font-bold text-slate-800"
                  >
                    {field.label}
                    {field.required && <span className="text-red-500"> *</span>}
                  </label>
                  {field.help && <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{field.help}</p>}
                  <div className="mt-2">
                    {field.type === "select" ? (
                      <div className="flex flex-wrap gap-2">
                        {(field.options ?? []).map((option) => {
                          const selected = values[field.key] === option;
                          return (
                            <button
                              key={option}
                              type="button"
                              disabled={locked}
                              aria-pressed={selected}
                              onClick={() => setValues((v) => ({ ...v, [field.key]: option }))}
                              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition disabled:opacity-60 ${
                                selected
                                  ? "bg-teal-700 text-white"
                                  : "border border-slate-200 bg-white text-slate-600 hover:border-teal-300"
                              }`}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    ) : field.type === "textarea" ? (
                      <textarea
                        id={`note-${field.key}`}
                        value={values[field.key]}
                        placeholder={field.placeholder}
                        disabled={locked}
                        rows={3}
                        onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                        className={inputClass}
                      />
                    ) : (
                      <input
                        id={`note-${field.key}`}
                        type="text"
                        value={values[field.key]}
                        placeholder={field.placeholder}
                        disabled={locked}
                        onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                        className={inputClass}
                      />
                    )}
                  </div>
                </div>
              );
            })}

            <div>
              <label htmlFor="note-free" className="block text-sm font-bold text-slate-800">
                Anything else
              </label>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Free text, for whatever the fields above don&apos;t cover.
              </p>
              <textarea
                id="note-free"
                value={freeText}
                disabled={locked}
                rows={3}
                onChange={(e) => setFreeText(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-teal-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>

            {!locked && sessionCompleted && recommendable.length > 0 && (
              <CarePlanFields
                options={recommendable}
                needsApproval={recommendationNeedsApproval}
                awaitingClinic={recommendationAwaitingClinic}
                value={plan}
                onChange={(next) => {
                  setPlan(next);
                  setPlanError(null);
                }}
              />
            )}

            {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
            {planError && <p className="text-xs font-semibold text-amber-700">{planError}</p>}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
            <button
              type="button"
              onClick={close}
              className="text-sm font-semibold text-slate-500 transition hover:text-slate-800"
            >
              {locked ? "Close" : "Cancel"}
            </button>
            {!locked && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending}
                className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-50"
              >
                {isPending
                  ? "Saving..."
                  : plan
                    ? "Save note & recommend"
                    : existing
                      ? "Save changes"
                      : "Save note"}
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
