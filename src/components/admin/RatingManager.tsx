"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RatingManager({
  title,
  average,
  count,
  excludedCount,
  visible,
  onToggleVisible,
}: {
  title: string;
  average: number | null;
  count: number;
  excludedCount: number;
  visible?: boolean;
  onToggleVisible?: { therapistId: string };
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleToggleVisible() {
    if (!onToggleVisible || visible === undefined) return;
    const next = !visible;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/set-therapist-rating-visibility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ therapistId: onToggleVisible.therapistId, visible: next }),
    });
    setLoading(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not update. Please try again.");
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
        <h2 className="font-bold text-sm text-slate-800">{title}</h2>
        {onToggleVisible && visible !== undefined && (
          <button
            onClick={handleToggleVisible}
            disabled={loading}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-60 ${
              visible
                ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
                : "bg-teal-700 hover:bg-teal-800 text-white"
            }`}
          >
            {loading ? "Saving..." : visible ? "Hide from public pages" : "Show on public pages"}
          </button>
        )}
      </div>
      {error && <p className="text-[11px] text-red-600 mb-2">{error}</p>}
      {average === null ? (
        <p className="text-xs text-slate-400 py-2">No ratings yet.</p>
      ) : (
        <p className="text-2xl font-bold text-slate-900">
          {average.toFixed(1)}{" "}
          <span className="text-sm font-semibold text-slate-400">
            ({count} rating{count === 1 ? "" : "s"})
          </span>
        </p>
      )}
      {excludedCount > 0 && (
        <p className="text-[11px] text-amber-600 mt-1">
          {excludedCount} rating{excludedCount === 1 ? "" : "s"} excluded from this average —
          still visible on its own session below.
        </p>
      )}
      {onToggleVisible && visible === false && (
        <p className="text-[11px] text-slate-400 mt-1">
          Hidden from public pages — only visible here to admin.
        </p>
      )}
    </div>
  );
}
