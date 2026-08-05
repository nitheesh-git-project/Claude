"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CANCELLATION_FULL_REFUND_HOURS } from "@/lib/pricing";
import { usePrompt } from "@/lib/usePrompt";

export default function CancelSessionButton({
  appointmentId,
  paid,
  slotTime,
}: {
  appointmentId: string;
  paid: boolean;
  slotTime: string | null;
}) {
  // The parent only renders this button for requested/confirmed sessions,
  // so a real success unmounts it via router.refresh() before this
  // optimistic overlay would need to clear on its own -- a failure just
  // reverts to the base `false`. See PatientActiveToggle's comment.
  const [optimisticCancelled, setOptimisticCancelled] = useOptimistic(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { prompt, dialog } = usePrompt();

  async function handleCancel() {
    const hoursUntilSlot = slotTime
      ? (new Date(slotTime).getTime() - Date.now()) / (1000 * 60 * 60)
      : null;
    const isLate = hoursUntilSlot !== null && hoursUntilSlot < CANCELLATION_FULL_REFUND_HOURS;
    const reason = await prompt(
      paid && isLate
        ? `Cancel this session? It's within ${CANCELLATION_FULL_REFUND_HOURS} hours of your slot, so this won't be refunded. You can add a reason (optional):`
        : paid
        ? "Cancel this session and refund the payment? You can add a reason (optional):"
        : "Cancel this session? You can add a reason (optional):"
    );
    if (reason === null) return; // dismissed the prompt
    setError(null);
    startTransition(async () => {
      setOptimisticCancelled(true);
      const res = await fetch("/api/appointments/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not cancel. Please try again.");
        if (res.status === 409) {
          // Someone else (another tab, or an admin) already cancelled this
          // session — refresh so the page reflects that instead of still
          // showing it as active.
          router.refresh();
        }
        return;
      }
      if (data.refundFailed) {
        setError(
          "Session cancelled, but the automatic refund failed — we'll process it manually. Contact us if you don't see it in a few days."
        );
      }
      router.refresh();
    });
  }

  if (optimisticCancelled && !error) {
    return <span className="text-[11px] font-semibold text-slate-500">Cancelling...</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleCancel}
        disabled={isPending}
        className="text-red-600 hover:underline text-[11px] font-semibold disabled:opacity-60"
      >
        Cancel Session
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      {dialog}
    </div>
  );
}
