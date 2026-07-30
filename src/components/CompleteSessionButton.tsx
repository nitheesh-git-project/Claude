"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CompleteSessionButton({ appointmentId }: { appointmentId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleComplete() {
    if (!window.confirm("Mark this session as completed?")) return;
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
        {loading ? "Saving..." : "Mark as Completed"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
