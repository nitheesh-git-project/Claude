"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useUnloadWarning } from "@/lib/useUnloadWarning";
import ApproveTherapistDialog, {
  type ApproveTherapistSummary,
} from "@/components/admin/ApproveTherapistDialog";

/**
 * A patient is approved in one tap. A therapist opens ApproveTherapistDialog,
 * which collects their revenue share and the rest of their setup before
 * approving -- pass `therapist` for that.
 */
export default function ApproveAccountButton({
  userId,
  therapist,
  canSetRevenueShare = false,
  homeVisitEnabled = false,
  canOpenRoster = false,
}: {
  userId: string;
  therapist?: ApproveTherapistSummary;
  canSetRevenueShare?: boolean;
  homeVisitEnabled?: boolean;
  canOpenRoster?: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  // The parent only renders this button for pending signups, so a real
  // success unmounts it via router.refresh() before this optimistic overlay
  // would need to clear on its own -- a failure just reverts to the base
  // `false`. See PatientActiveToggle's comment.
  const [optimisticApproved, setOptimisticApproved] = useOptimistic(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  useUnloadWarning(isPending);

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      setOptimisticApproved(true);
      const res = await fetch("/api/admin/approve-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
        keepalive: true,
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not approve. Please try again.");
      }
    });
  }

  if (therapist) {
    return (
      <>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
        >
          Approve
        </button>
        {dialogOpen && (
          <ApproveTherapistDialog
            userId={userId}
            therapist={therapist}
            canSetRevenueShare={canSetRevenueShare}
            homeVisitEnabled={homeVisitEnabled}
            canOpenRoster={canOpenRoster}
            onClose={() => setDialogOpen(false)}
            onApproved={() => {
              setDialogOpen(false);
              router.refresh();
            }}
          />
        )}
      </>
    );
  }

  if (optimisticApproved && !error) {
    return <span className="text-xs font-semibold text-teal-700">Approved</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleApprove}
        disabled={isPending}
        className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
      >
        Approve
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
