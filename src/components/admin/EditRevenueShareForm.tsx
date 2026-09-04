"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";

export default function EditRevenueShareForm({
  hospitalId,
  currentPercent,
}: {
  hospitalId: string;
  currentPercent: number;
}) {
  // Prop-derived base: reverts to the real prop on failure (no refresh
  // happens), matches the new prop on success once router.refresh() lands.
  const [optimisticPercent, setOptimisticPercent] = useOptimistic(currentPercent);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(currentPercent));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleSave() {
    if (value.trim() === "") {
      setError("Enter a percentage.");
      return;
    }
    setError(null);
    const newPercent = Number(value);
    startTransition(async () => {
      setOptimisticPercent(newPercent);
      const res = await fetch("/api/admin/update-hospital-revenue-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hospitalId, revenueSharePercent: value }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not update. Please try again.");
      }
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-bold text-slate-900">{optimisticPercent}%</span>
        <button
          onClick={() => {
            setValue(String(optimisticPercent));
            setEditing(true);
          }}
          className="text-[11px] text-teal-700 font-semibold hover:underline"
        >
          Edit
        </button>
      </div>
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
        disabled={isPending}
        className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-[11px] font-semibold px-2 py-1.5 rounded-lg transition"
      >
        {isPending ? "Saving..." : "Save"}
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
