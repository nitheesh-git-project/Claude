"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useConfirm } from "@/lib/useConfirm";

export default function TherapistActiveToggle({
  therapistId,
  active,
  upcomingSessionCount = 0,
  openPayoutRequestCount = 0,
}: {
  therapistId: string;
  active: boolean;
  // Both zero by default so today's exact confirm text is unchanged when
  // there's nothing in flight — these only add a clause when non-zero.
  upcomingSessionCount?: number;
  openPayoutRequestCount?: number;
}) {
  // See PatientActiveToggle's identical comment -- flips the label the
  // instant it's clicked instead of waiting on the fetch + router.refresh()
  // round trip.
  const [optimisticActive, setOptimisticActive] = useOptimistic(active);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function handleToggle() {
    const nextActive = !optimisticActive;
    if (!nextActive) {
      let message = "This will immediately block this therapist from signing in to their dashboard.";
      const notes: string[] = [];
      if (upcomingSessionCount > 0) {
        notes.push(
          `${upcomingSessionCount} upcoming session${
            upcomingSessionCount === 1 ? "" : "s"
          } still assigned to them (only an admin will be able to complete or reassign ${
            upcomingSessionCount === 1 ? "it" : "them"
          } while suspended)`
        );
      }
      if (openPayoutRequestCount > 0) {
        notes.push(
          `${openPayoutRequestCount} payout request${
            openPayoutRequestCount === 1 ? "" : "s"
          } still in progress (${
            openPayoutRequestCount === 1 ? "this" : "these"
          } can still be completed by an admin while suspended)`
        );
      }
      if (notes.length > 0) {
        message += ` They currently have ${notes.join(" and ")}.`;
      }
      message += " Continue?";
      if (!(await confirm(message))) {
        return;
      }
    }
    setError(null);
    startTransition(async () => {
      setOptimisticActive(nextActive);
      const res = await fetch("/api/admin/set-therapist-active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ therapistId, active: nextActive }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not update. Please try again.");
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleToggle}
        disabled={isPending}
        className={`text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-60 ${
          optimisticActive
            ? "bg-red-50 hover:bg-red-100 text-red-700"
            : "bg-teal-700 hover:bg-teal-800 text-white"
        }`}
      >
        {optimisticActive ? "Suspend Account" : "Reactivate Account"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      {dialog}
    </div>
  );
}
