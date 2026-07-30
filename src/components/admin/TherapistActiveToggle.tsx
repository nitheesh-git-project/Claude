"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TherapistActiveToggle({
  therapistId,
  active,
}: {
  therapistId: string;
  active: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleToggle() {
    const nextActive = !active;
    if (
      !nextActive &&
      !window.confirm(
        "This will immediately block this therapist from signing in to their dashboard. Continue?"
      )
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/set-therapist-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ therapistId, active: nextActive }),
    });
    setLoading(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not update. Please try again.");
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-60 ${
          active
            ? "bg-red-50 hover:bg-red-100 text-red-700"
            : "bg-teal-700 hover:bg-teal-800 text-white"
        }`}
      >
        {loading
          ? "Saving..."
          : active
          ? "Suspend Account"
          : "Reactivate Account"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
