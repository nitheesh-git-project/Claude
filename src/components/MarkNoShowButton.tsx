"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MarkNoShowButton({
  appointmentId,
}: {
  appointmentId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleMarkNoShow() {
    if (
      !window.confirm(
        "Mark this session as a no-show? The patient didn't attend. This won't change payout eligibility — the therapist still held the slot, same as a completed session."
      )
    )
      return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/appointments/complete-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId, noShow: true }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not update. Please try again.");
      if (res.status === 409) {
        // Someone else already changed this session (marked it done, or the
        // patient cancelled it) — refresh so this stops showing it as still
        // actionable.
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
        onClick={handleMarkNoShow}
        disabled={loading}
        className="bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition"
      >
        {loading ? "Saving..." : "No-Show"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
