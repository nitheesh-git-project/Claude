"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";

export default function LeadStatusButtons({
  leadId,
  status,
}: {
  leadId: string;
  status: string;
}) {
  // Prop-derived base: the next status is fully known client-side the
  // moment a button is clicked, so the button set updates instantly instead
  // of waiting on the fetch + router.refresh() round trip. Reverts to the
  // real prop on failure (no refresh happens); matches the new prop on
  // success once router.refresh() lands.
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function setStatus(newStatus: "contacted" | "declined") {
    setError(null);
    startTransition(async () => {
      setOptimisticStatus(newStatus);
      const res = await fetch("/api/admin/update-lead-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, status: newStatus }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not update. Please try again.");
      }
    });
  }

  if (optimisticStatus === "declined") {
    return null;
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {optimisticStatus === "new" && (
        <button
          onClick={() => setStatus("contacted")}
          disabled={isPending}
          className="bg-slate-200 hover:bg-slate-300 disabled:opacity-60 text-slate-800 text-xs font-semibold px-3 py-1.5 rounded-lg transition"
        >
          Mark Contacted
        </button>
      )}
      <button
        onClick={() => setStatus("declined")}
        disabled={isPending}
        className="bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-700 text-xs font-semibold px-3 py-1.5 rounded-lg transition"
      >
        Decline
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
