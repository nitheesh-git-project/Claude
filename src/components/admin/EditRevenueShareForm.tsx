"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EditRevenueShareForm({
  hospitalId,
  currentPercent,
}: {
  hospitalId: string;
  currentPercent: number;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(currentPercent));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSave() {
    if (value.trim() === "") {
      setError("Enter a percentage.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/update-hospital-revenue-share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hospitalId, revenueSharePercent: value }),
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
      <button
        onClick={() => {
          setValue(String(currentPercent));
          setEditing(true);
        }}
        className="text-[11px] text-teal-700 font-semibold hover:underline"
      >
        Edit
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <input
        type="number"
        min={0}
        max={100}
        step="0.01"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-16 p-1.5 text-xs rounded-lg border border-slate-300"
      />
      <button
        onClick={handleSave}
        disabled={loading}
        className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-[11px] font-semibold px-2 py-1.5 rounded-lg transition"
      >
        {loading ? "Saving..." : "Save"}
      </button>
      <button
        onClick={() => setEditing(false)}
        className="text-[11px] text-slate-500 font-semibold px-1"
      >
        Cancel
      </button>
      {error && <span className="text-[11px] text-red-600 w-full">{error}</span>}
    </div>
  );
}
