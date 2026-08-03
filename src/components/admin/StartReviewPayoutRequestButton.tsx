"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StartReviewPayoutRequestButton({ requestId }: { requestId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleStartReview() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/start-review-payout-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId }),
    });
    setLoading(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not start review. Please try again.");
      if (res.status === 409) router.refresh();
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleStartReview}
        disabled={loading}
        className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
      >
        {loading ? "Starting..." : "Start Review"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
