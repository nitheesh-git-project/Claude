"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AVAILABILITY_HOURS,
  computeDayAvailability,
  formatHourRange,
  type TemplateRow,
  type OverrideRow,
  type SlotState,
} from "@/lib/therapistAvailability";
import { istDateKey } from "@/lib/formatSlotRange";
import { useConfirm } from "@/lib/useConfirm";

type Therapist = {
  id: string;
  full_name: string | null;
  timezone: string | null;
  on_leave: boolean;
};

// Pinned to Asia/Kolkata via the same istDateKey helper AdminCalendarTab
// uses for its own "today" -- a runtime-local `new Date()` here would give
// a different day server-side (SSR, likely UTC) than client-side
// (hydration, the admin's own browser timezone) for roughly a third of
// each day, the same hydration-mismatch class of bug already fixed
// elsewhere in this codebase.
function todayKey() {
  return istDateKey(new Date().toISOString());
}

const STATE_STYLES: Record<SlotState, string> = {
  available: "bg-teal-700 border-teal-700 text-white",
  unavailable: "bg-slate-50 border-slate-200 text-slate-400",
  override_available: "bg-green-100 border-green-500 text-green-800",
  override_unavailable: "bg-red-100 border-red-400 text-red-700",
};

const STATE_TITLES: Record<SlotState, string> = {
  available: "Available (weekly) — click to mark unavailable for this date",
  unavailable: "Not available (weekly) — click to make available for this date",
  override_available: "Made available for this date by admin — click to clear override",
  override_unavailable: "Made unavailable for this date by admin — click to clear override",
};

export default function AdminRosterTab({
  therapists,
  templateRows,
  overrideRows,
}: {
  therapists: Therapist[];
  templateRows: (TemplateRow & { therapist_id: string })[];
  overrideRows: (OverrideRow & { therapist_id: string })[];
}) {
  const initial = todayKey();
  const [year, monthStr] = initial.split("-");
  const [viewYear, setViewYear] = useState(Number(year));
  const [viewMonth, setViewMonth] = useState(Number(monthStr) - 1);
  const [selectedDate, setSelectedDate] = useState(initial);
  const [pendingCellKey, setPendingCellKey] = useState<string | null>(null);
  const [pendingLeaveId, setPendingLeaveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  // Prop-derived base: each cell's next state (available/unavailable/
  // override) is fully known client-side the moment it's clicked, so the
  // grid updates instantly instead of waiting on the fetch + router.refresh()
  // round trip. Reverts to the real prop on failure (no refresh happens);
  // matches the new prop on success once router.refresh() lands.
  const [optimisticOverrideRows, setOverrideOverlay] = useOptimistic(
    overrideRows,
    (
      state,
      action:
        | { type: "set"; row: OverrideRow & { therapist_id: string } }
        | { type: "clear"; therapistId: string; date: string; hour: number }
    ) => {
      if (action.type === "set") {
        const filtered = state.filter(
          (r) =>
            !(
              r.therapist_id === action.row.therapist_id &&
              r.date === action.row.date &&
              r.hour === action.row.hour
            )
        );
        return [...filtered, action.row];
      }
      return state.filter(
        (r) =>
          !(
            r.therapist_id === action.therapistId &&
            r.date === action.date &&
            r.hour === action.hour
          )
      );
    }
  );
  const [isCellPending, startCellTransition] = useTransition();

  // Same prop-derived-base pattern, merging just the on_leave flag for the
  // one therapist that was toggled.
  const [optimisticTherapists, setOnLeaveOverlay] = useOptimistic(
    therapists,
    (state, overlay: { therapistId: string; onLeave: boolean }) =>
      state.map((t) => (t.id === overlay.therapistId ? { ...t, on_leave: overlay.onLeave } : t))
  );
  const [isLeavePending, startLeaveTransition] = useTransition();

  const templateByTherapist = useMemo(() => {
    const map = new Map<string, TemplateRow[]>();
    for (const r of templateRows) {
      const list = map.get(r.therapist_id) ?? [];
      list.push(r);
      map.set(r.therapist_id, list);
    }
    return map;
  }, [templateRows]);

  const overrideByTherapist = useMemo(() => {
    const map = new Map<string, OverrideRow[]>();
    for (const r of optimisticOverrideRows) {
      const list = map.get(r.therapist_id) ?? [];
      list.push(r);
      map.set(r.therapist_id, list);
    }
    return map;
  }, [optimisticOverrideRows]);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // Pinned to a fixed timeZone (not left to the runtime's local zone) --
  // without it, this can render a different string on the server (SSR) vs
  // the admin's browser (hydration), the same hydration-mismatch class of
  // bug already root-caused and fixed on AdminCalendarTab.
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
  const selectedDateLabel = new Date(`${selectedDate}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  function goToMonth(offset: number) {
    const d = new Date(viewYear, viewMonth + offset, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  function dateKeyFor(day: number) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
  }

  function handleDatePickerChange(value: string) {
    if (!value) return;
    setSelectedDate(value);
    const [y, m] = value.split("-");
    setViewYear(Number(y));
    setViewMonth(Number(m) - 1);
  }

  async function handleToggleOnLeave(therapistId: string, currentOnLeave: boolean) {
    const next = !currentOnLeave;
    if (next) {
      const confirmed = await confirm(
        "Mark this therapist as not available? They'll show as unavailable for every slot until this is turned back off. Their saved weekly schedule stays intact underneath."
      );
      if (!confirmed) return;
    }
    setError(null);
    startLeaveTransition(async () => {
      setPendingLeaveId(therapistId);
      setOnLeaveOverlay({ therapistId, onLeave: next });
      const res = await fetch("/api/admin/set-therapist-on-leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ therapistId, onLeave: next }),
      });
      setPendingLeaveId(null);
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not update that therapist's status. Please try again.");
      }
    });
  }

  function handleCellClick(therapistId: string, hour: number, state: SlotState) {
    const key = `${therapistId}-${hour}`;
    setError(null);

    let body: Record<string, unknown>;
    let overlay:
      | { type: "set"; row: OverrideRow & { therapist_id: string } }
      | { type: "clear"; therapistId: string; date: string; hour: number };
    if (state === "available") {
      body = { therapistId, date: selectedDate, hour, action: "set", available: false };
      overlay = {
        type: "set",
        row: { therapist_id: therapistId, date: selectedDate, hour, available: false },
      };
    } else if (state === "unavailable") {
      body = { therapistId, date: selectedDate, hour, action: "set", available: true };
      overlay = {
        type: "set",
        row: { therapist_id: therapistId, date: selectedDate, hour, available: true },
      };
    } else {
      body = { therapistId, date: selectedDate, hour, action: "clear" };
      overlay = { type: "clear", therapistId, date: selectedDate, hour };
    }

    startCellTransition(async () => {
      setPendingCellKey(key);
      setOverrideOverlay(overlay);
      const res = await fetch("/api/admin/set-availability-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setPendingCellKey(null);
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not update that slot. Please try again.");
      }
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
        <div>
          <h2 className="font-bold text-lg text-slate-800">Manage Roster</h2>
          <p className="text-xs text-slate-500 mt-1">
            Each therapist&apos;s declared weekly availability, in their own local time. Click a
            slot to override it for this specific date.
          </p>
        </div>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => handleDatePickerChange(e.target.value)}
          className="p-2 rounded-lg border border-slate-300 text-xs"
        />
      </div>

      <div className="flex items-center justify-between mt-4 mb-3">
        <button
          onClick={() => goToMonth(-1)}
          className="text-slate-500 hover:text-slate-800 px-2 py-1 text-xs font-semibold"
        >
          <i className="fa-solid fa-chevron-left"></i>
        </button>
        <p className="font-bold text-slate-800 text-sm">{monthLabel}</p>
        <button
          onClick={() => goToMonth(1)}
          className="text-slate-500 hover:text-slate-800 px-2 py-1 text-xs font-semibold"
        >
          <i className="fa-solid fa-chevron-right"></i>
        </button>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const key = dateKeyFor(day);
          const isSelected = key === selectedDate;
          const isToday = key === todayKey();
          return (
            <button
              key={day}
              onClick={() => setSelectedDate(key)}
              className={`p-2.5 rounded-lg border text-xs font-semibold transition ${
                isSelected
                  ? "bg-teal-700 text-white border-teal-700"
                  : isToday
                  ? "border-teal-400 text-slate-800"
                  : "border-slate-200 text-slate-700 hover:border-teal-300"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>

      <p className="text-xs font-semibold text-slate-600 mt-6 mb-3" suppressHydrationWarning>
        {`Availability for ${selectedDateLabel}`}
      </p>

      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
          {error}
        </div>
      )}

      <div className="flex items-center gap-4 text-[10px] text-slate-500 mb-3 flex-wrap">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-teal-700 inline-block"></span> Available (weekly)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-slate-100 border border-slate-300 inline-block"></span> Not available
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-green-100 border border-green-500 inline-block"></span> Made available (this date)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-red-100 border border-red-400 inline-block"></span> Made unavailable (this date)
        </span>
      </div>

      {optimisticTherapists.length === 0 ? (
        <p className="text-xs text-slate-500 py-6 text-center">No therapists yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse">
            <tbody>
              {optimisticTherapists.map((t) => {
                const dayState = computeDayAvailability(
                  selectedDate,
                  templateByTherapist.get(t.id) ?? [],
                  overrideByTherapist.get(t.id) ?? []
                );
                return (
                  <tr key={t.id}>
                    <td className="pr-3 py-1.5 align-top font-bold text-slate-900 whitespace-nowrap sticky left-0 bg-white">
                      {t.full_name ?? "Unknown"}
                      {t.timezone && (
                        <span className="block font-normal text-[10px] text-slate-400">
                          {t.timezone}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleToggleOnLeave(t.id, t.on_leave)}
                        disabled={isLeavePending && pendingLeaveId === t.id}
                        className={`mt-1 block font-semibold px-2 py-0.5 rounded-full text-[10px] disabled:opacity-50 ${
                          t.on_leave
                            ? "text-amber-800 bg-amber-100 hover:bg-amber-200"
                            : "text-slate-400 bg-slate-100 hover:bg-slate-200"
                        }`}
                      >
                        {t.on_leave ? "On Leave — click to restore" : "Mark Not Available"}
                      </button>
                    </td>
                    {t.on_leave ? (
                      <td
                        colSpan={AVAILABILITY_HOURS.length}
                        className="p-2 text-[10px] font-semibold text-amber-700 bg-amber-50 rounded-lg"
                      >
                        Marked not available by {t.full_name ?? "this therapist"} or admin — every
                        slot is unavailable until this is turned off.
                      </td>
                    ) : (
                      AVAILABILITY_HOURS.map((hour) => {
                        const state = dayState[hour];
                        const key = `${t.id}-${hour}`;
                        return (
                          <td key={hour} className="p-0.5">
                            <button
                              type="button"
                              disabled={isCellPending && pendingCellKey === key}
                              onClick={() => handleCellClick(t.id, hour, state)}
                              title={STATE_TITLES[state]}
                              className={`w-24 py-2 rounded-md text-[10px] font-semibold border transition whitespace-nowrap disabled:opacity-50 ${STATE_STYLES[state]}`}
                            >
                              {formatHourRange(hour)}
                            </button>
                          </td>
                        );
                      })
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {dialog}
    </div>
  );
}
