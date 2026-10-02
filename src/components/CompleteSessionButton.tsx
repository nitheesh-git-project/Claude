"use client";

import { useState } from "react";
import { useToast } from "@/lib/toast";
import { useRouter } from "@/lib/useRouter";
import ConfirmDialog from "@/components/ConfirmDialog";
import Spinner from "@/components/system/Spinner";
import { debugNow, debugNowHeaders } from "@/lib/debugNow";

export default function CompleteSessionButton({
  appointmentId,
  slotTime,
}: {
  appointmentId: string;
  slotTime: string | null;
}) {
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const { show } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function openConfirm() {
    // The route refuses Done before the session's start (sessionCompletion.ts)
    // for a therapist, so asking "mark it done anyway?" only led to a refusal.
    // An admin is exempt and still gets the warning. Judged against the
    // debug bar's simulated clock, the same one the route reads when
    // ALLOW_DEBUG_CLOCK is on, so the warning and the answer agree.
    const isBeforeScheduledTime = slotTime ? new Date(slotTime).getTime() > debugNow() : false;
    setError(null);
    setConfirmMessage(
      isBeforeScheduledTime
        ? "This session's scheduled time hasn't arrived yet. Mark it done anyway? (Only an admin can close a session before it starts.)"
        : "Mark this session as done? You'll be asked to rate it next."
    );
  }

  async function handleComplete() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/appointments/complete-session", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...debugNowHeaders() },
      body: JSON.stringify({ appointmentId }),
    });
    setLoading(false);
    setConfirmMessage(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not update. Please try again.");
      // A 409 is either "not started yet" (nothing changed -- leave the card
      // as it is) or "someone else already changed this session" -- refresh
      // so it stops showing as actionable. It used to toast "Session marked
      // as completed." for both, which was false for the first.
      if (res.status === 409 && !data.notYet) {
        router.refresh();
      }
      return;
    }
    show("Session marked as completed.");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={openConfirm}
        disabled={loading}
        className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg transition"
      >
        {loading ? (
          <span className="inline-flex items-center gap-1.5">
            <Spinner /> Saving…
          </span>
        ) : (
          "Done"
        )}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      {confirmMessage !== null && (
        <ConfirmDialog
          message={confirmMessage}
          confirming={loading}
          onConfirm={handleComplete}
          onCancel={() => setConfirmMessage(null)}
        />
      )}
    </div>
  );
}
