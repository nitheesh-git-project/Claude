"use client";

import { useState } from "react";
import SessionNoteDialog from "@/components/therapist/SessionNoteDialog";
import type { SessionNoteRow } from "@/lib/sessionNotes";
import type { RecommendableOption } from "@/components/therapist/CarePlanFields";

/**
 * The entry point to a session note, rendered on the session card itself.
 *
 * Deliberately on the card rather than behind the patient's chart: the
 * moment a therapist is most able to write an accurate note is the moment
 * they finish the session and are still looking at it. Anything that costs
 * a navigation gets written later, or not at all.
 */
export default function SessionNoteButton({
  appointmentId,
  patientName,
  sessionLabel,
  note,
  editable,
  hoursLeft,
  patientId,
  sessionCompleted,
  recommendable = [],
  recommendationNeedsApproval = true,
  recommendationAwaitingClinic = false,
}: {
  appointmentId: string;
  patientName: string;
  sessionLabel: string;
  note: SessionNoteRow | null;
  /** Whether the note is still inside its 24-hour edit window. Decided on
   *  the server (the page already has a request-time clock) rather than
   *  from the browser's, so the two never disagree at hydration -- and the
   *  submit route re-checks anyway, which is the real enforcement. */
  editable: boolean;
  /** Hours left in that window, for the dialog's own warning line. */
  hoursLeft: number | null;
  patientId: string;
  /** Whether the session has been marked complete. Gates the optional
   *  recommend section inside the dialog -- a plan is written after seeing
   *  someone, and the submit route re-checks. */
  sessionCompleted: boolean;
  /** Programmes admin has cleared for recommendation, resolved server-side.
   *  Empty hides the section rather than showing an empty picker. */
  recommendable?: RecommendableOption[];
  /** Whether the clinic reviews a recommendation before the patient sees
   *  it. Defaults to true, matching the setting it comes from -- the wrong
   *  default here would promise a therapist their patient can see something
   *  nobody has approved. */
  recommendationNeedsApproval?: boolean;
  /** This patient already has a recommendation in the clinic's queue. */
  recommendationAwaitingClinic?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
          note
            ? "border border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-700"
            : "bg-amber-500 text-white hover:bg-amber-600"
        }`}
      >
        <i aria-hidden className={`fa-solid ${note ? "fa-file-lines" : "fa-pen-to-square"} text-[10px]`} />
        {note ? (editable ? "Edit session note" : "View session note") : "Add session note"}
      </button>

      {open && (
        <SessionNoteDialog
          appointmentId={appointmentId}
          patientName={patientName}
          sessionLabel={sessionLabel}
          existing={note}
          locked={!!note && !editable}
          hoursLeft={hoursLeft}
          patientId={patientId}
          sessionCompleted={sessionCompleted}
          recommendable={recommendable}
          recommendationNeedsApproval={recommendationNeedsApproval}
          recommendationAwaitingClinic={recommendationAwaitingClinic}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
