"use client";

import { useToast } from "@/lib/toast";
import { useState } from "react";
import { useRouter } from "@/lib/useRouter";
import { useUnloadWarning } from "@/lib/useUnloadWarning";
import { useTherapistUnavailable } from "@/components/admin/TherapistUnavailableDialog";
import Spinner from "@/components/system/Spinner";

const MIN_REASON = 10;

/**
 * Approve or decline a pay-later booking (owner's decision: the clinic
 * approves each one). Shown in the session drawer while the booking's
 * approval is pending, to admins whose scope covers money -- the route is
 * `money` scope, and a control an admin cannot call is not drawn.
 *
 * Declining needs a reason, because the patient reads it: their booking
 * becomes an ordinary one they pay online.
 */
export default function PayLaterApprovalControls({
  appointmentId,
  therapistId,
  therapistName,
}: {
  appointmentId: string;
  therapistId: string | null;
  therapistName: string | null;
}) {
  const [mode, setMode] = useState<"idle" | "declining">("idle");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { show } = useToast();
  const { showIfUnavailable, dialog: unavailableDialog } = useTherapistUnavailable();
  useUnloadWarning(busy !== null);

  async function decide(decision: "approve" | "decline") {
    setBusy(decision);
    setError(null);
    const res = await fetch("/api/admin/pay-later-approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId, decision, reason: decision === "decline" ? reason : undefined }),
      keepalive: true,
    });
    setBusy(null);
    if (res.ok) {
      show(
        decision === "approve"
          ? therapistId
            ? `Approved. ${therapistName ?? "The therapist"} is confirmed and the patient has been told.`
            : "Approved. It can be confirmed once a therapist is assigned."
          : "Declined. The patient has been emailed the reason."
      );
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (therapistId && showIfUnavailable(data, therapistId)) return;
    setError(data.error ?? "That didn't go through. Please try again.");
    if (data.approved) router.refresh();
  }

  const reasonShort = reason.trim().length < MIN_REASON;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
      <p className="text-xs font-bold text-slate-800">Pay-later booking waiting for approval</p>
      <p className="text-xs text-slate-700">
        The patient asked to pay after the session.{" "}
        {therapistId
          ? `Approving confirms it with ${therapistName ?? "the assigned therapist"} and sends the patient their confirmation.`
          : "Approving lets it be confirmed once a therapist is assigned."}
      </p>
      {mode === "idle" ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => decide("approve")}
            disabled={busy !== null}
            className="bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-xs font-semibold px-3 py-2 rounded-lg transition"
          >
            {busy === "approve" ? (
              <span className="inline-flex items-center gap-1.5">
                <Spinner /> Approving…
              </span>
            ) : (
              "Approve pay later"
            )}
          </button>
          <button
            type="button"
            onClick={() => setMode("declining")}
            disabled={busy !== null}
            className="text-xs font-semibold px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-white disabled:opacity-60 transition"
          >
            Decline…
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <label htmlFor={`decline-reason-${appointmentId}`} className="block text-xs font-semibold text-slate-700">
            Why? The patient sees this, and is asked to pay online instead.
          </label>
          <textarea
            id={`decline-reason-${appointmentId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full text-xs p-2 rounded-lg border border-slate-300"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => decide("decline")}
              disabled={busy !== null || reasonShort}
              aria-describedby={reasonShort ? `decline-hint-${appointmentId}` : undefined}
              className="bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white text-xs font-semibold px-3 py-2 rounded-lg transition"
            >
              {busy === "decline" ? (
                <span className="inline-flex items-center gap-1.5">
                  <Spinner /> Declining…
                </span>
              ) : (
                "Decline pay later"
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("idle");
                setError(null);
              }}
              disabled={busy !== null}
              className="text-xs font-semibold text-slate-600 hover:underline"
            >
              Cancel
            </button>
            {reasonShort && (
              <span id={`decline-hint-${appointmentId}`} className="text-[11px] text-slate-500">
                At least {MIN_REASON} characters.
              </span>
            )}
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-[11px] text-red-600">
          {error}
        </p>
      )}
      {unavailableDialog}
    </div>
  );
}
