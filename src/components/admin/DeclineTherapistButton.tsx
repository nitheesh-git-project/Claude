"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function DeclineTherapistButton({
  therapistId,
}: {
  therapistId: string;
}) {
  // The parent only renders this button for pending applications, so a real
  // success unmounts it via router.refresh() before this optimistic overlay
  // would need to clear on its own -- a failure just reverts to the base
  // `false`. See PatientActiveToggle's comment.
  const [optimisticDeclined, setOptimisticDeclined] = useOptimistic(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleDecline() {
    setError(null);
    setConfirmOpen(false);
    startTransition(async () => {
      setOptimisticDeclined(true);
      const res = await fetch("/api/admin/decline-therapist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ therapistId }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not decline. Please try again.");
      }
    });
  }

  if (optimisticDeclined && !error) {
    return <span className="text-xs font-semibold text-slate-500">Declined</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={isPending}
        className="bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-700 text-xs font-semibold px-4 py-2 rounded-xl transition"
      >
        Decline
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      {confirmOpen && (
        <ConfirmDialog
          message="Decline this application? Their account will be deleted — this can't be undone, and they'd need to apply again from scratch."
          confirmLabel="Decline"
          confirming={isPending}
          onConfirm={handleDecline}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
