"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CancelSessionButton({
  appointmentId,
  paid,
}: {
  appointmentId: string;
  paid: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleCancel() {
    const reason = window.prompt(
      paid
        ? "Cancel this session and refund the payment? You can add a reason (optional):"
        : "Cancel this session? You can add a reason (optional):"
    );
    if (reason === null) return; // dismissed the prompt
    setLoading(true);
    setError(null);
    const res = await fetch("/api/appointments/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId, reason }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not cancel. Please try again.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleCancel}
        disabled={loading}
        className="text-red-600 hover:underline text-[11px] font-semibold disabled:opacity-60"
      >
        {loading ? "Cancelling..." : "Cancel Session"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
