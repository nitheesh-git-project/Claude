"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function DeclineTherapistButton({
  therapistId,
}: {
  therapistId: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleDecline() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/decline-therapist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ therapistId }),
    });
    setLoading(false);
    setConfirmOpen(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not decline. Please try again.");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={loading}
        className="bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-700 text-xs font-semibold px-4 py-2 rounded-xl transition"
      >
        Decline
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      {confirmOpen && (
        <ConfirmDialog
          message="Decline this application? Their account will be deleted — this can't be undone, and they'd need to apply again from scratch."
          confirmLabel="Decline"
          confirming={loading}
          onConfirm={handleDecline}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
