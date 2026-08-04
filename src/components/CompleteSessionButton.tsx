"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function CompleteSessionButton({
  appointmentId,
  slotTime,
}: {
  appointmentId: string;
  slotTime: string | null;
}) {
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function openConfirm() {
    const isBeforeScheduledTime = slotTime ? new Date(slotTime).getTime() > Date.now() : false;
    setConfirmMessage(
      isBeforeScheduledTime
        ? "This session's scheduled time hasn't passed yet — mark it done anyway? You'll be asked to rate it next."
        : "Mark this session as done? You'll be asked to rate it next."
    );
  }

  async function handleComplete() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/appointments/complete-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId }),
    });
    setLoading(false);
    setConfirmMessage(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not update. Please try again.");
      if (res.status === 409) {
        // Someone else already changed this session (marked it done/no-show,
        // or the patient cancelled it) — refresh so this stops showing it as
        // still actionable.
        router.refresh();
      }
      return;
    }
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
        {loading ? "Saving..." : "Done"}
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
