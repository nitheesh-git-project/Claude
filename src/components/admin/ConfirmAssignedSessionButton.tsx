"use client";

import { useState } from "react";
import { useTherapistUnavailable } from "@/components/admin/TherapistUnavailableDialog";
import { useRouter } from "@/lib/useRouter";
import { useUnloadWarning } from "@/lib/useUnloadWarning";
import Spinner from "@/components/system/Spinner";

/**
 * Confirms a session that already has a therapist but is still
 * `requested` -- the "Assigned, not confirmed" queue (sessionAssignQueue.ts).
 *
 * It is Assign & Confirm with the therapist already on the session, so the
 * route re-checks their hours and clashes, creates the calendar event and
 * emails the patient, exactly as a fresh assignment would. A therapist who
 * is no longer free gets the same "Unable to assign" dialog.
 */
export default function ConfirmAssignedSessionButton({
  appointmentId,
  therapistId,
  therapistName,
}: {
  appointmentId: string;
  therapistId: string;
  therapistName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { showIfUnavailable, dialog: unavailableDialog } = useTherapistUnavailable();
  useUnloadWarning(loading);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/assign-appointment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId, therapistId }),
      keepalive: true,
    });
    setLoading(false);
    if (res.ok) {
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (showIfUnavailable(data, therapistId)) return;
    setError(data.error ?? "Could not confirm. Please try again.");
  }

  return (
    <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
      <p className="text-xs text-slate-700">
        {therapistName} is assigned, but this session has not been confirmed yet. The patient
        has not been sent a confirmation or a calendar invite.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={loading}
          className="bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-xs font-semibold px-3 py-2 rounded-lg transition"
        >
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <Spinner /> Confirming…
            </span>
          ) : (
            "Confirm session"
          )}
        </button>
        {error && (
          <span role="alert" className="text-[11px] text-red-600">
            {error}
          </span>
        )}
      </div>
      {unavailableDialog}
    </div>
  );
}
