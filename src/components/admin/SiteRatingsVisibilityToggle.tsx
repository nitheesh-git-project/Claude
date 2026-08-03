"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SiteRatingsVisibilityToggle({
  visible,
}: {
  visible: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleToggle() {
    const next = !visible;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/set-ratings-visible-publicly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visible: next }),
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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-bold text-sm text-slate-800">Ratings Visible on Public Pages</h2>
          <p className="text-[11px] text-slate-400 mt-1 max-w-md">
            Global switch for the /team page and homepage. Off hides every
            therapist&apos;s rating number sitewide, regardless of that
            therapist&apos;s own visibility setting — useful while review
            volume is still thin. Ratings keep being collected either way;
            this only controls what visitors see.
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={loading}
          className={`text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-60 shrink-0 ${
            visible
              ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
              : "bg-teal-700 hover:bg-teal-800 text-white"
          }`}
        >
          {loading ? "Saving..." : visible ? "Hide Ratings Sitewide" : "Show Ratings Sitewide"}
        </button>
      </div>
      {error && <p className="text-[11px] text-red-600 mt-2">{error}</p>}
    </div>
  );
}
