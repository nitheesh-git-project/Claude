"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AVAILABILITY_HOURS,
  DAY_ORDER,
  DAY_LABELS,
  formatHourRange,
} from "@/lib/therapistAvailability";

type Slot = { day_of_week: number; hour: number };

function slotKey(day: number, hour: number) {
  return `${day}-${hour}`;
}

function toSet(slots: Slot[]) {
  return new Set(slots.map((s) => slotKey(s.day_of_week, s.hour)));
}

function setsEqual(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

export default function TherapistAvailabilityRoster({
  initialSlots,
  timezone,
}: {
  initialSlots: Slot[];
  timezone: string | null;
}) {
  // Prop-derived base: recomputed fresh whenever initialSlots changes (e.g.
  // after this component's own router.refresh() lands). While editing, the
  // grid shows the local draft (`enabled`); once saved, the view flips back
  // to this committed value instantly instead of waiting on the RSC payload
  // to stream in. Reverts to the real prop on failure (no refresh happens,
  // and editing stays open so the revert is never even visible).
  const baseEnabled = useMemo(() => toSet(initialSlots), [initialSlots]);
  const [optimisticEnabled, setOptimisticEnabled] = useOptimistic(baseEnabled);
  const [enabled, setEnabled] = useState<Set<string>>(baseEnabled);
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const isDirty = !setsEqual(enabled, optimisticEnabled);
  const displayedEnabled = editing ? enabled : optimisticEnabled;

  function toggle(day: number, hour: number) {
    if (!editing) return;
    const key = slotKey(day, hour);
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleEdit() {
    setError(null);
    setEnabled(new Set(optimisticEnabled));
    setEditing(true);
  }

  function handleCancel() {
    setEnabled(new Set(optimisticEnabled));
    setError(null);
    setEditing(false);
  }

  function handleSave() {
    setError(null);
    const next = new Set(enabled);
    const slots: Slot[] = Array.from(next).map((key) => {
      const [day, hour] = key.split("-").map(Number);
      return { day_of_week: day, hour };
    });
    startTransition(async () => {
      setOptimisticEnabled(next);
      const res = await fetch("/api/therapist/save-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not save your availability. Please try again.");
      }
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h2 className="font-bold text-lg text-slate-800">Your Weekly Availability</h2>
        {!editing ? (
          <button
            onClick={handleEdit}
            className="bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold px-4 py-2 rounded-lg transition"
          >
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              disabled={isPending}
              className="bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-800 text-xs font-semibold px-4 py-2 rounded-lg transition"
            >
              Cancel
            </button>
            {isDirty && (
              <button
                onClick={handleSave}
                disabled={isPending}
                className="bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg transition"
              >
                {isPending ? "Saving..." : "Save"}
              </button>
            )}
          </div>
        )}
      </div>
      <p className="text-[11px] text-slate-400 mb-4">
        This is your recurring weekly schedule, in your own local time
        {timezone ? ` (${timezone})` : ""}. Set it once and it repeats identically every week —
        you only need to come back and change it if your regular hours change. It tells admin
        when to expect you&apos;re available; it doesn&apos;t book anything by itself.
      </p>
      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          {error}
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
                  const isOn = displayedEnabled.has(slotKey(day, hour));
                  return (
                    <td key={hour} className="p-0.5">
                      <button
                        type="button"
                        onClick={() => toggle(day, hour)}
                        disabled={!editing}
                        title={formatHourRange(hour)}
                        className={`w-24 py-2 rounded-md text-[10px] font-semibold border transition whitespace-nowrap ${
                          isOn
                            ? "bg-teal-700 border-teal-700 text-white"
                            : "bg-slate-50 border-slate-200 text-slate-400"
                        } ${editing ? "hover:border-teal-300 cursor-pointer" : "cursor-default"}`}
                      >
                        {formatHourRange(hour)}
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
