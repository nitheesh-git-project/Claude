"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useConfirm } from "@/lib/useConfirm";

// Suspend or restore a hospital partner. The counterpart to
// PatientActiveToggle / TherapistActiveToggle, which existed long before
// this one -- the dashboard already *read* a hospital's active flag (a
// suspended partner earns no revenue share going forward) but nothing could
// set it, so that branch was unreachable.
export default function HospitalActiveToggle({
  hospitalId,
  active,
  sharePercent,
}: {
  hospitalId: string;
  active: boolean;
  // Only used to say out loud what suspending actually costs the partner --
  // the number itself is re-derived server-side wherever it matters.
  sharePercent: number;
}) {
  // Same optimistic pattern as the other two toggles: flip the label on
  // click rather than waiting for the fetch + router.refresh() round trip,
  // and fall back to the real prop if the request fails.
  const [optimisticActive, setOptimisticActive] = useOptimistic(active);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function handleToggle() {
    const nextActive = !optimisticActive;
    if (!nextActive) {
      const ok = await confirm(
        `This blocks the partner from signing in, and stops their ${sharePercent}% revenue share on every session from now on. Sessions already delivered keep the split they had. Continue?`
      );
      if (!ok) return;
    }
    setError(null);
    startTransition(async () => {
      setOptimisticActive(nextActive);
      const res = await fetch("/api/admin/set-hospital-active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ hospitalId, active: nextActive }),
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
        {optimisticActive ? "Suspend Partner" : "Restore Partner"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      {dialog}
    </div>
  );
}
