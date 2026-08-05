"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/lib/useConfirm";

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
  // The parent only renders this button for reviewing requests, so a real
  // success unmounts it via router.refresh() before this optimistic overlay
  // would need to clear on its own -- a failure just reverts to the base
  // `false`. See PatientActiveToggle's comment.
  const [optimisticCompleted, setOptimisticCompleted] = useOptimistic(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function handleComplete() {
    const confirmMessage =
      currentlyOwedPaise > 0
        ? `This therapist still shows ₹${(currentlyOwedPaise / 100).toLocaleString(
            "en-IN"
          )} owed and unsettled in the Payouts tab — mark this request completed anyway?`
        : "Mark this payout request as completed? The therapist will be notified.";
    if (!(await confirm(confirmMessage))) return;

    setError(null);
    startTransition(async () => {
      setOptimisticCompleted(true);
      const res = await fetch("/api/admin/complete-payout-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not mark this completed. Please try again.");
      }
    });
  }

  if (optimisticCompleted && !error) {
    return <span className="text-xs font-semibold text-teal-700">Marked Completed</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleComplete}
        disabled={isPending}
        className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
      >
        Mark Completed
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      {dialog}
    </div>
  );
}
