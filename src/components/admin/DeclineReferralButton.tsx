"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";

export default function DeclineReferralButton({
  referralId,
}: {
  referralId: string;
}) {
  // The parent only renders this button for pending referrals, so a real
  // success unmounts it via router.refresh() before this optimistic overlay
  // would need to clear on its own -- a failure just reverts to the base
  // `false`. See PatientActiveToggle's comment.
  const [optimisticDeclined, setOptimisticDeclined] = useOptimistic(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleDecline() {
    setError(null);
    startTransition(async () => {
      setOptimisticDeclined(true);
      const res = await fetch("/api/admin/decline-referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referralId }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not decline. Please try again.");
        // Either way this fails, it means the referral's real status is no
        // longer what this page's snapshot showed (an invite went out,
        // possibly moments ago) — refresh so the stale "Decline" option
        // stops being offered.
        router.refresh();
      }
    });
  }

  if (optimisticDeclined && !error) {
    return <span className="text-xs font-semibold text-slate-500">Declined</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleDecline}
        disabled={isPending}
        className="bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-700 text-xs font-semibold px-3 py-2 rounded-lg transition"
      >
        Decline
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
