"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CompletePayoutRequestButton({
  requestId,
  currentlyOwedPaise,
}: {
  requestId: string;
  // Passed from data the admin dashboard page already has -- lets this
  // button warn if the therapist's Payouts-tab balance hasn't actually
  // been settled yet, so tapping Completed here doesn't silently paper
  // over a request nobody's paid.
  currentlyOwedPaise: number;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleComplete() {
    const confirmMessage =
      currentlyOwedPaise > 0
        ? `This therapist still shows ₹${(currentlyOwedPaise / 100).toLocaleString(
            "en-IN"
          )} owed and unsettled in the Payouts tab — mark this request completed anyway?`
        : "Mark this payout request as completed? The therapist will be notified.";
    if (!window.confirm(confirmMessage)) return;

    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/complete-payout-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId }),
    });
    setLoading(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not mark this completed. Please try again.");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleComplete}
        disabled={loading}
        className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
      >
        {loading ? "Marking..." : "Mark Completed"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
