"use client";

import { useState } from "react";
import SessionNoteDialog from "@/components/therapist/SessionNoteDialog";
import { debugNow } from "@/lib/debugNow";
import type { SessionNoteRow } from "@/lib/sessionNotes";
import type { SummaryForDialog } from "@/lib/sessionSummary";
import type { RecommendableOption } from "@/components/therapist/CarePlanFields";

/**
 * The therapist's Done. It no longer closes a session on its own: it opens
 * the session note with the Pain Map step, and saving that note is what
 * finishes the session (the complete-session route refuses a therapist's
 * Done without both). Rating follows on the completed card.
 *
 * Before the start time it says so inline instead of opening anything. The
 * line takes a full row of its own (`basis-full`) so it wraps under the
 * buttons rather than widening Done's column and pushing No Show away.
 */
export default function FinishSessionButton({
  appointmentId,
  slotTime,
  patientName,
  sessionLabel,
  note,
  editable,
  hoursLeft,
  patientId,
  recommendable = [],
  recommendationCategoryId = null,
  recommendationNeedsApproval = true,
  recommendationAwaitingClinic = false,
  summary,
  homeExercisePrefill = null,
  beside,
}: {
  /** Rendered next to Done in one unbreakable pair (the card's No Show), so
   *  a long Join label in the same row can never push it under Done. */
  beside?: React.ReactNode;
  appointmentId: string;
  slotTime: string | null;
  patientName: string;
  sessionLabel: string;
  note: SessionNoteRow | null;
  editable: boolean;
  hoursLeft: number | null;
  patientId: string;
  recommendable?: RecommendableOption[];
  /** The session's own condition, which a recommendation starts on. */
  recommendationCategoryId?: string | null;
  recommendationNeedsApproval?: boolean;
  recommendationAwaitingClinic?: boolean;
  /** The patient's summary of this session, written beside the note. */
  summary: SummaryForDialog;
  /** The active Home exercises as a line, for a new note's empty field. */
  homeExercisePrefill?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [notYet, setNotYet] = useState(false);

  function handleClick() {
    // Judged against the debug bar's clock, the same one the route reads.
    if (slotTime && new Date(slotTime).getTime() > debugNow()) {
      setNotYet(true);
      return;
    }
    setNotYet(false);
    setOpen(true);
  }

  return (
    <>
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        <button
          type="button"
          onClick={handleClick}
          aria-label="Done"
          aria-describedby={`finish-help-${appointmentId}`}
          className="inline-flex min-h-[44px] flex-col items-start justify-center rounded-lg bg-teal-700 px-3.5 py-1.5 text-left text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
        >
          <span className="text-sm font-semibold leading-tight">Done</span>
          {/* What Done does, on the button: the note (and the condition
              type's exam, where it needs one), then the session closes. */}
          <span id={`finish-help-${appointmentId}`} className="text-[13px] font-normal leading-tight text-teal-50">
            Note and exam, then it closes
          </span>
        </button>
        {beside}
      </span>
      {notYet && (
        <span role="status" className="order-last basis-full text-[13px] text-red-700">
          This session hasn&apos;t started yet. You can mark it done once it&apos;s under way.
        </span>
      )}
      {open && (
        <SessionNoteDialog
          appointmentId={appointmentId}
          patientName={patientName}
          sessionLabel={sessionLabel}
          existing={note}
          locked={!!note && !editable}
          hoursLeft={hoursLeft}
          patientId={patientId}
          sessionCompleted={false}
          recommendable={recommendable}
          recommendationCategoryId={recommendationCategoryId}
          recommendationNeedsApproval={recommendationNeedsApproval}
          recommendationAwaitingClinic={recommendationAwaitingClinic}
          summary={summary}
          homeExercisePrefill={homeExercisePrefill}
          completeOnSave
          sessionStartIso={slotTime}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
