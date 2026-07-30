"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LeadStatusButtons({
  leadId,
  status,
}: {
  leadId: string;
  status: string;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function setStatus(newStatus: "contacted" | "declined") {
    setLoading(newStatus);
    setError(null);
    const res = await fetch("/api/admin/update-lead-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, status: newStatus }),
    });
    setLoading(null);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not update. Please try again.");
    }
  }

  if (status === "declined") {
    return null;
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {status === "new" && (
        <button
          onClick={() => setStatus("contacted")}
          disabled={loading !== null}
          className="bg-slate-200 hover:bg-slate-300 disabled:opacity-60 text-slate-800 text-xs font-semibold px-3 py-1.5 rounded-lg transition"
        >
          {loading === "contacted" ? "Marking..." : "Mark Contacted"}
        </button>
      )}
      <button
        onClick={() => setStatus("declined")}
        disabled={loading !== null}
        className="bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-700 text-xs font-semibold px-3 py-1.5 rounded-lg transition"
      >
        {loading === "declined" ? "Declining..." : "Decline"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
