"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TherapistTeamVisibilityToggle({
  therapistId,
  visibleOnTeam,
}: {
  therapistId: string;
  visibleOnTeam: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleToggle() {
    const next = !visibleOnTeam;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/set-therapist-team-visibility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ therapistId, visibleOnTeam: next }),
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
          visibleOnTeam
            ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
            : "bg-teal-700 hover:bg-teal-800 text-white"
        }`}
      >
        {loading
          ? "Saving..."
          : visibleOnTeam
          ? "Hide from /team page"
          : "Show on /team page"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
