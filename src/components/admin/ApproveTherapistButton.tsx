"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUnloadWarning } from "@/lib/useUnloadWarning";

export default function ApproveTherapistButton({
  therapistId,
}: {
  therapistId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  useUnloadWarning(loading);

  async function handleApprove() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/approve-therapist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ therapistId }),
      keepalive: true,
    });
    setLoading(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not approve. Please try again.");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleApprove}
        disabled={loading}
        className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
      >
        {loading ? "Approving..." : "Approve"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
