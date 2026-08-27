"use client";

import { useState } from "react";
import ConditionIntakeWizard from "@/components/profile/ConditionIntakeWizard";
import SpecialtySummary from "@/components/profile/SpecialtySummary";
import { countAnswered, countedQuestions, isAnswered, type IntakeQuestion } from "@/lib/conditionIntake";
import type { ConditionSpecialty } from "@/lib/conditionSpecialty";
import { authorshipSplit, type AnswerAuthor } from "@/lib/healthProfileSummary";

// The dashboard-side face of the Patient Care Intake: what's on file,
// rendered as a finished piece of the patient's chart, plus one button
// that opens the step-by-step wizard.
//
// The questions themselves deliberately do NOT render on the dashboard --
// seeing seven fields at once was the thing patients read as paperwork
// and abandoned. Answers live here, inputs live in the pop-up.
export default function ConditionIntakePanel({
  specialty,
  questions,
  endpoint,
  draftEndpoint,
  patientId,
  currentData,
  formInitialData,
  locked,
  lockedMessage,
  canEdit = true,
  emptyStateText,
  voice = "patient",
  authorship,
  draftIsMine = true,
}: {
  specialty: ConditionSpecialty;
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
  /** False when this record is not the viewer's to open at all -- a
   *  patient before their therapist has filled it in. Distinct from
   *  `locked`, which means "yours, but not right now" (a submission is in
   *  review). When false the button and the answered counter are ABSENT
   *  rather than disabled: a greyed-out "Start — 2 minutes" reads as
   *  broken software, absence reads as "not your job". */
  canEdit?: boolean;
  /** Who is holding the screen. The therapist edits a patient's record
   *  through this same panel, so none of the copy below can be written for
   *  the patient alone -- see ConditionIntakeWizard's `voice`. */
  voice?: "patient" | "clinician";
  /** Who wrote each answer, so the counter can say "3 answered with your
   *  therapist" instead of implying the patient left four blank. */
  authorship?: Map<string, AnswerAuthor>;
  /** False when the autosaved draft was left by somebody else. `draft_data`
   *  is one column shared by both roles' autosave, so without this a
   *  therapist's abandoned half-edit tells the patient *they* left off
   *  part-way through. */
  draftIsMine?: boolean;
  /** Replaces the default "nothing on file" copy, which assumes the
   *  reader is the one who will fill it in. */
  emptyStateText?: string;
}) {
  const clinician = voice === "clinician";
  const [open, setOpen] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  // "N of 7", not "N of 9": a pre-step like the paediatric caregiver pair
  // is asked but not counted -- see IntakeQuestion.excludeFromCount.
  const countedTotal = countedQuestions(questions).length;
  const answeredNow = countAnswered(questions, currentData);
  const draftAnswered = countAnswered(questions, formInitialData);
  const started = draftAnswered > 0;
  const complete = draftAnswered === countedTotal;
  const missingRequired = questions.filter((q) => q.required && !isAnswered(q, formInitialData)).length;
  // An unfinished fill the patient can pick up again: there are answers
  // in the resume buffer that haven't made it into the live profile yet.
  // Only offer to resume a draft the reader actually left. Somebody else's
  // abandoned edit is still restored into the form (it is the newest state
  // of the record), but it is never announced as theirs.
  const hasUnfinishedWork = draftAnswered > answeredNow && draftIsMine;
  const split = authorshipSplit(questions, currentData, authorship ?? new Map());
  const missingRequiredNow = questions.filter(
    (q) => q.required && !isAnswered(q, currentData)
  ).length;

  return (
    <div>
      {answeredNow === 0 && !started ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-5 text-center">
          <p className="font-display text-base font-bold text-slate-800">Nothing on file yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">
            {emptyStateText ??
              (clinician
                ? `${countedTotal} short questions to go through together.`
                : `${countedTotal} short questions, one at a time, about two minutes.`)}
          </p>
        </div>
      ) : (
        <SpecialtySummary
          specialty={specialty}
          questions={questions}
          data={answeredNow > 0 ? currentData : formInitialData}
        />
      )}

      {canEdit && hasUnfinishedWork && !locked && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
          <i aria-hidden className="fa-solid fa-pen-to-square mt-0.5 text-xs text-amber-600" />
          <p className="text-xs text-amber-800">
            <span className="font-semibold">You left off part-way through.</span> Everything you
            typed was saved — {draftAnswered} of {countedTotal} answered
            {missingRequired > 0 && `, ${missingRequired} needed ${missingRequired === 1 ? "one" : "ones"} still blank`}
            .{" "}
            {clinician
              ? "It is not on their record until you send it."
              : "Nothing reaches your therapist until you send it in."}
          </p>
        </div>
      )}

      {canEdit && (
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={locked}
          className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-50"
        >
          {!started
            ? clinician
              ? "Start"
              : "Start — 2 minutes"
            : hasUnfinishedWork
              ? "Finish where you left off"
              : complete
                ? clinician
                  ? "Review or update their answers"
                  : "Review or update answers"
                : // "Add the missing answers" is only honest when something
                  // required is genuinely missing. Otherwise what is left is
                  // optional, and calling it missing invents a failure.
                  missingRequiredNow > 0
                  ? "Add the missing answers"
                  : "Add more detail"}
        </button>
        <span className="text-xs text-slate-500">
          {clinician || split.byClinician === 0
            ? `${split.byPatient + split.byClinician} of ${countedTotal} answered`
            : split.unanswered === 0
              ? `All ${countedTotal} answered`
              : `${split.byClinician} answered with your therapist · ${split.unanswered} you can add`}
        </span>
      </div>
      )}

      {lockedMessage && (locked || !canEdit) && (
        <p className="mt-3 text-xs text-slate-500">{lockedMessage}</p>
      )}
      {justSubmitted && (
        <p className="mt-2 text-xs font-semibold text-emerald-600">
          {clinician ? "Sent — the clinic will review it shortly." : "Sent — the clinic will check it shortly."}
        </p>
      )}

      {canEdit && open && (
        <ConditionIntakeWizard
          questions={questions}
          endpoint={endpoint}
          draftEndpoint={draftEndpoint}
          patientId={patientId}
          voice={voice}
          initialData={formInitialData}
          onClose={() => setOpen(false)}
          onSubmitted={() => setJustSubmitted(true)}
        />
      )}
    </div>
  );
}
