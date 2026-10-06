"use client";

import { useState } from "react";
import SessionNoteDialog from "@/components/therapist/SessionNoteDialog";
import { debugNow } from "@/lib/debugNow";
import type { SessionNoteRow } from "@/lib/sessionNotes";
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
  recommendationNeedsApproval = true,
  recommendationAwaitingClinic = false,
}: {
  appointmentId: string;
  slotTime: string | null;
  patientName: string;
  sessionLabel: string;
  note: SessionNoteRow | null;
  editable: boolean;
  hoursLeft: number | null;
  patientId: string;
  recommendable?: RecommendableOption[];
  recommendationNeedsApproval?: boolean;
  recommendationAwaitingClinic?: boolean;
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
      <button
        type="button"
        onClick={handleClick}
        className="bg-teal-700 hover:bg-teal-800 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg transition"
      >
        Done
      </button>
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
          recommendationNeedsApproval={recommendationNeedsApproval}
          recommendationAwaitingClinic={recommendationAwaitingClinic}
          completeOnSave
          sessionStartIso={slotTime}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
