"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PatientActiveToggle({
  patientId,
  active,
  upcomingSessionCount = 0,
}: {
  patientId: string;
  active: boolean;
  // Assigned/paid-but-not-yet-happened sessions this patient still has —
  // surfaced in the suspend confirmation so an admin isn't suspending
  // blind. Zero by default keeps today's exact confirm text unchanged.
  upcomingSessionCount?: number;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleToggle() {
    const nextActive = !active;
    if (!nextActive) {
      let message = "This will immediately block this patient from signing in to their dashboard.";
      if (upcomingSessionCount > 0) {
        message += ` They currently have ${upcomingSessionCount} upcoming session${
          upcomingSessionCount === 1 ? "" : "s"
        } on the calendar.`;
      }
      message += " Continue?";
      if (!window.confirm(message)) {
        return;
      }
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/set-patient-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, active: nextActive }),
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
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-60 ${
          active
            ? "bg-red-50 hover:bg-red-100 text-red-700"
            : "bg-teal-700 hover:bg-teal-800 text-white"
        }`}
      >
        {loading
          ? "Saving..."
          : active
          ? "Suspend Account"
          : "Reactivate Account"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
