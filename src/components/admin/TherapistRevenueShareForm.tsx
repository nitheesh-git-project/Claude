"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TherapistRevenueShareForm({
  therapistId,
  currentPercent,
}: {
  therapistId: string;
  currentPercent: number | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentPercent !== null ? String(currentPercent) : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const parsed = Number(value);
  const companyPercent = value !== "" && !Number.isNaN(parsed) ? 100 - parsed : null;

  async function handleSave() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/update-therapist-revenue-share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ therapistId, revenueSharePercent: value }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not update. Please try again.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="text-xs">
        {currentPercent !== null ? (
          <p className="text-slate-600">
            Therapist gets <strong className="text-slate-900">{currentPercent}%</strong>{" "}
            of each session fee, company keeps{" "}
            <strong className="text-slate-900">{100 - currentPercent}%</strong>.
          </p>
        ) : (
          <p className="text-slate-400">Not set yet — payouts can&apos;t be calculated.</p>
        )}
        <button
          onClick={() => {
            setValue(currentPercent !== null ? String(currentPercent) : "");
            setError(null);
            setEditing(true);
          }}
          className="text-teal-700 font-semibold hover:underline mt-1"
        >
          {currentPercent !== null ? "Edit" : "Set Revenue Share"}
        </button>
      </div>
    );
  }

  return (
    <div className="text-xs space-y-2">
      {error && <p className="text-red-600">{error}</p>}
      <div className="flex items-end gap-3">
        <div>
          <label className="block font-semibold mb-1">Therapist %</label>
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-24 p-2 rounded-lg border border-slate-300"
          />
        </div>
        <div>
          <label className="block font-semibold mb-1 text-slate-400">Company %</label>
          <div className="w-24 p-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
            {companyPercent !== null ? `${companyPercent}%` : "—"}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setEditing(false)}
          className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold px-3 py-1.5 rounded-lg transition"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={loading}
          className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold px-3 py-1.5 rounded-lg transition"
        >
          {loading ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
