"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function MarkPaidByCashButton({ appointmentId }: { appointmentId: string }) {
  // The parent only renders this button for unpaid sessions, so a real
  // success unmounts it via router.refresh() before this optimistic overlay
  // would need to clear on its own -- a failure just reverts to the base
  // `false`. See PatientActiveToggle's comment.
  const [optimisticPaid, setOptimisticPaid] = useOptimistic(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleConfirm() {
    setError(null);
    setConfirmOpen(false);
    startTransition(async () => {
      setOptimisticPaid(true);
      const res = await fetch("/api/admin/mark-paid-by-cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not update. Please try again.");
      }
    });
  }

  if (optimisticPaid && !error) {
    return <span className="text-[11px] font-semibold text-teal-700">Marked as paid</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={isPending}
        className="bg-teal-50 hover:bg-teal-100 disabled:opacity-60 text-teal-700 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition"
      >
        Paid by Cash
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      {confirmOpen && (
        <ConfirmDialog
          message="Mark this session as paid by cash? This records the payment and confirms the session (if a therapist is already assigned) — only do this after you've actually received the cash."
          confirmLabel="Mark Paid"
          confirming={isPending}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
