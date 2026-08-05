"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/lib/useConfirm";

export default function MarkNoShowButton({
  appointmentId,
}: {
  appointmentId: string;
}) {
  // The parent only renders this button while status === "confirmed", so a
  // real success unmounts it via router.refresh() before this optimistic
  // overlay would ever need to clear on its own -- a failure just reverts
  // to the base `false` and the button reappears for a retry. See
  // PatientActiveToggle's comment for the general pattern.
  const [optimisticDone, setOptimisticDone] = useOptimistic(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function handleMarkNoShow() {
    if (
      !(await confirm(
        "Mark this session as a no-show? The patient didn't attend. This won't change payout eligibility — the therapist still held the slot, same as a completed session."
      ))
    )
      return;
    setError(null);
    startTransition(async () => {
      setOptimisticDone(true);
      const res = await fetch("/api/appointments/complete-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId, noShow: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not update. Please try again.");
        if (res.status === 409) {
          // Someone else already changed this session (marked it done, or
          // the patient cancelled it) — refresh so this stops showing it as
          // still actionable.
          router.refresh();
        }
        return;
      }
      router.refresh();
    });
  }

  if (optimisticDone) {
    return <span className="text-[11px] font-semibold text-slate-500">Marked as no-show</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleMarkNoShow}
        disabled={isPending}
        className="bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition"
      >
        No-Show
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      {dialog}
    </div>
  );
}
