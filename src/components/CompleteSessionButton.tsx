"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CompleteSessionButton({
  appointmentId,
  slotTime,
}: {
  appointmentId: string;
  slotTime: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleComplete() {
    const isBeforeScheduledTime = slotTime ? new Date(slotTime).getTime() > Date.now() : false;
    const confirmMessage = isBeforeScheduledTime
      ? "This session's scheduled time hasn't passed yet — mark it done anyway? You'll be asked to rate it next."
      : "Mark this session as done? You'll be asked to rate it next.";
    if (!window.confirm(confirmMessage)) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/appointments/complete-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not update. Please try again.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleComplete}
        disabled={loading}
        className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg transition"
      >
        {loading ? "Saving..." : "Done"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
