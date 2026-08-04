"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function MarkPaidByCashButton({ appointmentId }: { appointmentId: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/mark-paid-by-cash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId }),
    });
    setLoading(false);
    setConfirmOpen(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not update. Please try again.");
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={loading}
        className="bg-teal-50 hover:bg-teal-100 disabled:opacity-60 text-teal-700 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition"
      >
        {loading ? "Saving..." : "Paid by Cash"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      {confirmOpen && (
        <ConfirmDialog
          message="Mark this session as paid by cash? This records the payment and confirms the session (if a therapist is already assigned) — only do this after you've actually received the cash."
          confirmLabel="Mark Paid"
          confirming={loading}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
