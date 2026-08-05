"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function StartReviewPayoutRequestButton({ requestId }: { requestId: string }) {
  // The parent only renders this button for pending requests, so a real
  // success unmounts it via router.refresh() before this optimistic overlay
  // would need to clear on its own -- a failure just reverts to the base
  // `false`. See PatientActiveToggle's comment.
  const [optimisticReviewing, setOptimisticReviewing] = useOptimistic(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleStartReview() {
    setError(null);
    startTransition(async () => {
      setOptimisticReviewing(true);
      const res = await fetch("/api/admin/start-review-payout-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not start review. Please try again.");
        if (res.status === 409) router.refresh();
      }
    });
  }

  if (optimisticReviewing && !error) {
    return <span className="text-xs font-semibold text-amber-700">Under Review</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleStartReview}
        disabled={isPending}
        className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
      >
        Start Review
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
