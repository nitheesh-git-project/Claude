"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TherapistOnLeaveToggle({ initialOnLeave }: { initialOnLeave: boolean }) {
  const [onLeave, setOnLeave] = useState(initialOnLeave);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleToggle() {
    const next = !onLeave;
    if (next) {
      const confirmed = window.confirm(
        "Mark yourself as not available? Admin will see you as unavailable for every slot until you turn this back off. Your saved weekly schedule stays intact underneath."
      );
      if (!confirmed) return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/therapist/set-on-leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onLeave: next }),
    });
    setSaving(false);
    if (res.ok) {
      setOnLeave(next);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not update your status. Please try again.");
    }
  }

  return (
    <div
      className={`bg-white rounded-2xl border shadow-sm p-6 flex items-center justify-between flex-wrap gap-3 ${
        onLeave ? "border-amber-300" : "border-slate-200"
      }`}
    >
      <div>
        <h2 className="font-bold text-lg text-slate-800">
          {onLeave ? "You're Marked Not Available" : "You're Available for Bookings"}
        </h2>
        <p className="text-[11px] text-slate-400 mt-1">
          {onLeave
            ? "Admin sees you as unavailable for every slot right now, regardless of your saved weekly schedule. Turn this off when you're back."
            : "Going on leave or taking a break? Turn this on and admin will see you as unavailable everywhere until you turn it back off."}
        </p>
        {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
      </div>
      <button
        onClick={handleToggle}
        disabled={saving}
        className={`text-xs font-bold px-4 py-2 rounded-lg transition disabled:opacity-50 whitespace-nowrap ${
          onLeave
            ? "bg-teal-700 hover:bg-teal-800 text-white"
            : "bg-amber-100 hover:bg-amber-200 text-amber-800"
        }`}
      >
        {saving ? "Updating..." : onLeave ? "Mark Available Again" : "Mark Not Available"}
      </button>
    </div>
  );
}
