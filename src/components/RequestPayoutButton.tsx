"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RequestPayoutButton({
  owedPaise,
  requestStatus,
}: {
  owedPaise: number;
  requestStatus: "none" | "pending" | "reviewing";
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleRequest() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/therapist/request-payout", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not send the request. Please try again.");
      if (res.status === 409) {
        // Another tab (or a stale cache of this page) already sent one --
        // refresh so this button reflects that instead of still inviting a
        // second request.
        router.refresh();
      }
      return;
    }
    router.refresh();
  }

  if (requestStatus === "pending" || requestStatus === "reviewing") {
    return (
      <button
        disabled
        className="text-xs font-semibold px-4 py-2 rounded-xl bg-slate-100 text-slate-400 cursor-not-allowed"
      >
        {requestStatus === "reviewing" ? "Under Review" : "Request Pending"}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleRequest}
        disabled={loading || owedPaise <= 0}
        className="text-xs font-semibold px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 disabled:cursor-not-allowed text-white transition"
      >
        {loading ? "Sending..." : "Request Payout"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
