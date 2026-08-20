"use client";

import { useState } from "react";
import ConditionIntakeWizard from "@/components/profile/ConditionIntakeWizard";
import ConditionSummaryCard from "@/components/profile/ConditionSummaryCard";
import { countAnswered, isAnswered, type IntakeQuestion } from "@/lib/conditionIntake";

// The dashboard-side face of the Patient Care Intake: what's on file,
// rendered as a finished piece of the patient's chart, plus one button
// that opens the step-by-step wizard.
//
// The questions themselves deliberately do NOT render on the dashboard --
// seeing seven fields at once was the thing patients read as paperwork
// and abandoned. Answers live here, inputs live in the pop-up.
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
  const missingRequired = questions.filter((q) => q.required && !isAnswered(q, formInitialData)).length;
  // An unfinished fill the patient can pick up again: there are answers
  // in the resume buffer that haven't made it into the live profile yet.
  const hasUnfinishedWork = draftAnswered > answeredNow;

  return (
    <div>
      {answeredNow === 0 && !started ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-5 text-center">
          <p className="font-display text-base font-bold text-slate-800">Nothing on file yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">
            Seven short questions, one at a time, about two minutes. Answer them and your therapist walks into
            your first session already knowing what hurts.
          </p>
        </div>
      ) : (
        <ConditionSummaryCard questions={questions} data={answeredNow > 0 ? currentData : formInitialData} />
      )}

      {hasUnfinishedWork && !locked && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
          <i aria-hidden className="fa-solid fa-pen-to-square mt-0.5 text-xs text-amber-600" />
          <p className="text-xs text-amber-800">
            <span className="font-semibold">You left off part-way through.</span> Everything you typed was saved
            — {draftAnswered} of {questions.length} answered
            {missingRequired > 0 && `, ${missingRequired} needed ${missingRequired === 1 ? "one" : "ones"} still blank`}
            . Nothing reaches your therapist until you send it in.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={locked}
          className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-50"
        >
          {!started
            ? "Start — 2 minutes"
            : hasUnfinishedWork
              ? "Finish where you left off"
              : complete
                ? "Review or update answers"
                : "Add the missing answers"}
        </button>
        <span className="text-xs text-slate-500">
          {draftAnswered} of {questions.length} answered
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
