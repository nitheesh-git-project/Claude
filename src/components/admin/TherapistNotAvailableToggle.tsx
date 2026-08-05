"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function TherapistNotAvailableToggle({
  therapistId,
  onLeave,
}: {
  therapistId: string;
  onLeave: boolean;
}) {
  // See PatientActiveToggle's identical comment -- flips the label the
  // instant it's clicked instead of waiting on the fetch + router.refresh()
  // round trip.
  const [optimisticOnLeave, setOptimisticOnLeave] = useOptimistic(onLeave);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleToggle() {
    const next = !optimisticOnLeave;
    setError(null);
    setConfirmOpen(false);
    startTransition(async () => {
      setOptimisticOnLeave(next);
      const res = await fetch("/api/admin/set-therapist-on-leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ therapistId, onLeave: next }),
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
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => (optimisticOnLeave ? handleToggle() : setConfirmOpen(true))}
        disabled={isPending}
        className={`text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-60 ${
          optimisticOnLeave
            ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
            : "bg-amber-50 hover:bg-amber-100 text-amber-700"
        }`}
      >
        {optimisticOnLeave ? "Restore Availability" : "Mark Not Available"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      {confirmOpen && (
        <ConfirmDialog
          message="Mark this therapist as not available? They'll show as unavailable for every slot until this is turned back off. Their saved weekly schedule stays intact underneath."
          confirmLabel="Mark Not Available"
          confirming={isPending}
          onConfirm={handleToggle}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
