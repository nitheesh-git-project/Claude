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
          className="bg-teal-700 hover:bg-teal-800 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg transition"
        >
          Done
        </button>
        {beside}
      </span>
      {notYet && (
        <span role="status" className="order-last basis-full text-[11px] text-red-600">
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
          completeOnSave
          sessionStartIso={slotTime}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
