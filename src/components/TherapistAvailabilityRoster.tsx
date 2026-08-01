"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AVAILABILITY_HOURS,
  DAY_ORDER,
  DAY_LABELS,
  formatHourLabel,
} from "@/lib/therapistAvailability";

type Slot = { day_of_week: number; hour: number };

function slotKey(day: number, hour: number) {
  return `${day}-${hour}`;
}

export default function TherapistAvailabilityRoster({
  initialSlots,
  timezone,
}: {
  initialSlots: Slot[];
  timezone: string | null;
}) {
  const [enabled, setEnabled] = useState<Set<string>>(
    new Set(initialSlots.map((s) => slotKey(s.day_of_week, s.hour)))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const router = useRouter();

  const isDirty =
    enabled.size !== initialSlots.length ||
    initialSlots.some((s) => !enabled.has(slotKey(s.day_of_week, s.hour)));

  function toggle(day: number, hour: number) {
    setSavedMessage(null);
    const key = slotKey(day, hour);
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    const slots: Slot[] = Array.from(enabled).map((key) => {
      const [day, hour] = key.split("-").map(Number);
      return { day_of_week: day, hour };
    });
    const res = await fetch("/api/therapist/save-availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slots }),
    });
    setSaving(false);
    if (res.ok) {
      setSavedMessage("Availability saved.");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save your availability. Please try again.");
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h2 className="font-bold text-lg text-slate-800">Your Weekly Availability</h2>
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="bg-teal-700 hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold px-4 py-2 rounded-lg transition"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      <p className="text-[11px] text-slate-400 mb-4">
        Tap the hours you&apos;re generally free to take sessions, in your own local time
        {timezone ? ` (${timezone})` : ""}. This tells admin when to expect you&apos;re
        available — it doesn&apos;t book anything by itself.
      </p>
      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          {error}
        </div>
      )}
      {savedMessage && !isDirty && (
        <div className="text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded-lg p-3 mb-4">
          {savedMessage}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <tbody>
            {DAY_ORDER.map((day) => (
              <tr key={day}>
                <td className="pr-3 py-1 font-semibold text-slate-700 whitespace-nowrap sticky left-0 bg-white">
                  {DAY_LABELS[day]}
                </td>
                {AVAILABILITY_HOURS.map((hour) => {
                  const isOn = enabled.has(slotKey(day, hour));
                  return (
                    <td key={hour} className="p-0.5">
                      <button
                        type="button"
                        onClick={() => toggle(day, hour)}
                        title={formatHourLabel(hour)}
                        className={`w-14 py-2 rounded-md text-[10px] font-semibold border transition whitespace-nowrap ${
                          isOn
                            ? "bg-teal-700 border-teal-700 text-white"
                            : "bg-slate-50 border-slate-200 text-slate-400 hover:border-teal-300"
                        }`}
                      >
                        {formatHourLabel(hour)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
