"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useConfirm } from "@/lib/useConfirm";

export default function PatientActiveToggle({
  patientId,
  active,
  upcomingSessionCount = 0,
}: {
  patientId: string;
  active: boolean;
  // Assigned/paid-but-not-yet-happened sessions this patient still has —
  // surfaced in the suspend confirmation so an admin isn't suspending
  // blind. Zero by default keeps today's exact confirm text unchanged.
  upcomingSessionCount?: number;
}) {
  // Flips the button's label the instant it's clicked, rather than waiting
  // on the fetch + router.refresh() round trip -- useOptimistic reverts back
  // to the real `active` prop on its own once this transition settles,
  // which happens automatically on a failure (no server update landed) and
  // seamlessly on success (router.refresh() delivers the same value back).
  const [optimisticActive, setOptimisticActive] = useOptimistic(active);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function handleToggle() {
    const nextActive = !optimisticActive;
    if (!nextActive) {
      let message = "This will immediately block this patient from signing in to their dashboard.";
      if (upcomingSessionCount > 0) {
        message += ` They currently have ${upcomingSessionCount} upcoming session${
          upcomingSessionCount === 1 ? "" : "s"
        } on the calendar.`;
      }
      message += " Continue?";
      if (!(await confirm(message))) {
        return;
      }
    }
    setError(null);
    startTransition(async () => {
      setOptimisticActive(nextActive);
      const res = await fetch("/api/admin/set-patient-active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, active: nextActive }),
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
