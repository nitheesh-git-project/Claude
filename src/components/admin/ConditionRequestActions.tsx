"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";

export default function ConditionRequestActions({ requestId }: { requestId: string }) {
  const [declining, setDeclining] = useState(false);
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function decide(action: "approve" | "decline") {
    if (action === "decline" && !notes.trim()) {
      setError("Please explain why you're declining this.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/condition-requests/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action, adminNotes: notes }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not save. Please try again.");
      }
    });
  }

  if (declining) {
    return (
      <div className="space-y-2">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Reason for declining (shown to the submitter)"
          rows={2}
          className="w-full p-2 rounded-lg border border-slate-300 text-xs"
        />
        {error && <p className="text-[11px] text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={() => setDeclining(false)}
            className="bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold px-3 py-1.5 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={() => decide("decline")}
            disabled={isPending}
            className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
          >
            {isPending ? "Declining..." : "Confirm Decline"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          onClick={() => setDeclining(true)}
          disabled={isPending}
          className="bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-700 text-xs font-semibold px-3 py-2 rounded-lg transition"
        >
          Decline
        </button>
        <button
          onClick={() => decide("approve")}
          disabled={isPending}
          className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-3 py-2 rounded-lg transition"
        >
          {isPending ? "Approving..." : "Approve"}
        </button>
      </div>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
