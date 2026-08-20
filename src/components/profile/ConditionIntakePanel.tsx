"use client";

import { useState } from "react";
import ConditionIntakeWizard, { AnswerPreview } from "@/components/profile/ConditionIntakeWizard";
import { countAnswered, isAnswered, type IntakeQuestion } from "@/lib/conditionIntake";

// The dashboard-side face of the Patient Care Intake: a short summary of
// what's on file plus one button that opens the step-by-step wizard.
// The questions themselves deliberately do NOT render on the dashboard --
// seeing seven fields at once was the thing patients read as paperwork
// and abandoned. Here they see only what they've already said and what's
// left, and answer inside the pop-up.
export default function ConditionIntakePanel({
  questions,
  endpoint,
  draftEndpoint,
  patientId,
  currentData,
  formInitialData,
  locked,
  lockedMessage,
}: {
  questions: IntakeQuestion[];
  endpoint: string;
  draftEndpoint?: string;
  patientId?: string;
  /** What's live/approved right now -- what the summary shows. */
  currentData: Record<string, string>;
  /** What the wizard should open with: a draft, a declined submission's
   *  answers, or currentData. The caller decides; see the resume-priority
   *  comment on the pages. */
  formInitialData: Record<string, string>;
  /** True while a submission is awaiting admin review -- one pending
   *  request per patient at a time, so there's nothing to edit until it
   *  clears. */
  locked: boolean;
  lockedMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const answeredNow = countAnswered(questions, currentData);
  const draftAnswered = countAnswered(questions, formInitialData);
  const started = draftAnswered > 0;
  const complete = draftAnswered === questions.length;

  return (
    <div>
      {answeredNow === 0 && !started ? (
        <p className="text-sm text-slate-600">
          Nothing on file yet. Answering takes about two minutes and means your therapist walks into your
          first session already knowing what hurts.
        </p>
      ) : (
        <div className="space-y-2.5">
          {questions.map((q) => (
            <div key={q.key} className="rounded-xl bg-slate-50 px-3.5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {q.shortLabel ?? q.label}
              </p>
              <div className="mt-0.5 text-sm text-slate-700">
                <AnswerPreview question={q} value={currentData[q.key]} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={locked}
          className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-50"
        >
          {!started ? "Start — 2 minutes" : complete ? "Review or update answers" : "Continue where you left off"}
        </button>
        <span className="text-xs text-slate-500">
          {draftAnswered} of {questions.length} answered
          {questions.some((q) => q.required && !isAnswered(q, formInitialData)) && " — some needed ones missing"}
        </span>
      </div>

      {locked && lockedMessage && <p className="mt-2 text-xs text-slate-500">{lockedMessage}</p>}
      {justSubmitted && (
        <p className="mt-2 text-xs font-semibold text-emerald-600">Sent — an admin will review it shortly.</p>
      )}

      {open && (
        <ConditionIntakeWizard
          questions={questions}
          endpoint={endpoint}
          draftEndpoint={draftEndpoint}
          patientId={patientId}
          initialData={formInitialData}
          onClose={() => setOpen(false)}
          onSubmitted={() => setJustSubmitted(true)}
        />
      )}
    </div>
  );
}
