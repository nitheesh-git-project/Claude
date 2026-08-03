"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AssignTherapistForm({
  appointmentId,
  therapists,
}: {
  appointmentId: string;
  therapists: { id: string; full_name: string }[];
}) {
  const [therapistId, setTherapistId] = useState(therapists[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleAssign() {
    if (!therapistId) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/assign-appointment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId, therapistId }),
    });
    setLoading(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not assign. Please try again.");
    }
  }

  if (therapists.length === 0) {
    return (
      <p className="text-[11px] text-slate-400">
        No approved therapists yet — approve one above first.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={therapistId}
        onChange={(e) => setTherapistId(e.target.value)}
        className="text-xs p-2 rounded-lg border border-slate-300"
      >
        {therapists.map((t) => (
          <option key={t.id} value={t.id}>
            {t.full_name}
          </option>
        ))}
      </select>
      <button
        onClick={handleAssign}
        disabled={loading}
        className="bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-xs font-semibold px-3 py-2 rounded-lg transition"
      >
        {loading ? "Assigning..." : "Assign & Confirm"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
