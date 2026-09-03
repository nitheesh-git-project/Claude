"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";

export default function TherapistTeamVisibilityToggle({
  therapistId,
  visibleOnTeam,
}: {
  therapistId: string;
  visibleOnTeam: boolean;
}) {
  // See PatientActiveToggle's identical comment -- flips the label the
  // instant it's clicked instead of waiting on the fetch + router.refresh()
  // round trip.
  const [optimisticVisible, setOptimisticVisible] = useOptimistic(visibleOnTeam);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleToggle() {
    const next = !optimisticVisible;
    setError(null);
    startTransition(async () => {
      setOptimisticVisible(next);
      const res = await fetch("/api/admin/set-therapist-team-visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ therapistId, visibleOnTeam: next }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not update. Please try again.");
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleToggle}
        disabled={isPending}
        className={`text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-60 ${
          optimisticVisible
            ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
            : "bg-teal-700 hover:bg-teal-800 text-white"
        }`}
      >
        {optimisticVisible ? "Hide from /team page" : "Show on /team page"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
