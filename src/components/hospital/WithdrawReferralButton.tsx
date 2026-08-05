"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/lib/useConfirm";

export default function WithdrawReferralButton({
  referralId,
}: {
  referralId: string;
}) {
  // The parent only renders this button while the referral is still
  // pending_review/therapist_assigned, so a real success unmounts it via
  // router.refresh() before this optimistic overlay would need to clear on
  // its own -- a failure just reverts to the base `false`. See
  // PatientActiveToggle's comment.
  const [optimisticWithdrawn, setOptimisticWithdrawn] = useOptimistic(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function handleWithdraw() {
    if (!(await confirm("Withdraw this referral? The clinic will no longer act on it."))) {
      return;
    }
    setError(null);
    startTransition(async () => {
      setOptimisticWithdrawn(true);
      const res = await fetch("/api/hospital/withdraw-referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referralId }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not withdraw. Please try again.");
        // A stale status snapshot (e.g. an invite went out moments ago) is
        // the most likely cause of a failure here -- refresh so this option
        // stops being offered once that's no longer true.
        router.refresh();
      }
    });
  }

  if (optimisticWithdrawn && !error) {
    return <span className="text-xs font-semibold text-slate-500">Withdrawing...</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleWithdraw}
        disabled={isPending}
        className="text-red-600 hover:text-red-800 disabled:opacity-60 font-semibold"
      >
        Withdraw
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      {dialog}
    </div>
  );
}
