"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";

// The therapist's own confirmation that they took payment at the door. A
// single, fairly irreversible action -- see record-cash-collection's CAS
// guard -- so it goes through the same confirm-dialog pattern as
// CompleteSessionButton rather than firing on a plain click.
export default function CollectCashButton({
  appointmentId,
  amountPaise,
}: {
  appointmentId: string;
  amountPaise: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/therapist/record-cash-collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId, amountPaise }),
    });
    setLoading(false);
    setConfirming(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not record this. Please try again.");
      if (res.status === 409) router.refresh();
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={loading}
        className="rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
      >
        {loading ? "Saving..." : `Collect ₹${(amountPaise / 100).toLocaleString("en-IN")}`}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      {confirming && (
        <ConfirmDialog
          message={`Confirm you collected ₹${(amountPaise / 100).toLocaleString("en-IN")} in cash for this visit? This can't be undone.`}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
