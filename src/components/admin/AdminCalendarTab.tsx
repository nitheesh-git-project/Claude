"use client";

import { useMemo, useState } from "react";
import SessionDetailDrawer, {
  type SessionDetailAppointment,
  type ReassignmentLogEntry,
} from "@/components/admin/SessionDetailDrawer";
import type { HomeVisitRow } from "@/components/admin/HomeVisitVisitActions";
import JoinSessionButton from "@/components/JoinSessionButton";
import { formatSlotRange, istDateKey } from "@/lib/formatSlotRange";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";

type Person = { id: string; full_name: string | null };
type Category = {
  id: string;
  title: string;
  price_paise: number;
  duration_minutes: number;
  active?: boolean;
};

const STATUS_STYLES: Record<string, string> = {
  requested: "text-amber-700 bg-amber-50",
  confirmed: "text-purple-700 bg-purple-50",
  completed: "text-teal-700 bg-teal-50",
  cancelled: "text-red-700 bg-red-50",
};

function todayKey() {
  return istDateKey(new Date().toISOString());
}

export default function AdminCalendarTab({
  appointments,
  people,
  categories,
  therapists,
  reassignmentLogs,
  homeVisits,
  canSeeMoney,
  canManageSessions,
}: {
  appointments: SessionDetailAppointment[];
  people: Person[];
  categories: Category[];
  therapists: { id: string; full_name: string; active?: boolean }[];
  reassignmentLogs: ReassignmentLogEntry[];
  // Home-visit detail for the rows that have it, so a visit opened from the
  // calendar shows the same panel (address, travel fee, cash) it shows when
  // opened from All Sessions -- one session, one detail view, whichever
  // screen you arrived from.
  homeVisits: HomeVisitRow[];
  // Passed to SessionDetailDrawer, whose discretionary-refund form calls a
  // route guarded by requireAdminScope("money") -- a clinical admin can open
  // Sessions but not Money, so the form must not render for them.
  canSeeMoney: boolean;
  // Finance opens Sessions at `view`: they reconcile against what a session
  // was, and must not be able to cancel or reassign the sessions they are
  // reconciling. Every mutating control in the drawer already keys off this
  // flag, and requireAdminScope refuses them regardless -- this is the half
  // that stops them meeting a 403 with nothing explaining it.
  canManageSessions: boolean;
}) {
  const peopleMap = useMemo(
    () => new Map(people.map((p) => [p.id, p.full_name ?? "Unknown"])),
    [people]
  );
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const homeVisitMap = useMemo(() => new Map(homeVisits.map((v) => [v.id, v])), [homeVisits]);

  const initial = todayKey();
  const [year, monthStr] = initial.split("-");
  const [viewYear, setViewYear] = useState(Number(year));
  const [viewMonth, setViewMonth] = useState(Number(monthStr) - 1); // 0-indexed
  const [selectedDate, setSelectedDate] = useState(initial);
  const [selectedAppointment, setSelectedAppointment] = useState<SessionDetailAppointment | null>(
    null
  );

  // Cancelled sessions are excluded from the dot count — the dot means
  // "something's still actually happening this day", not "something was
  // once booked". They still show up in the day's session list below with
  // their cancelled badge, since that's still useful context once you've
  // drilled into a specific date.
  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of appointments) {
      if (!a.slot_time || a.status === "cancelled") continue;
      const key = istDateKey(a.slot_time);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [appointments]);

  const sessionsForSelectedDate = useMemo(
    () =>
      appointments
        .filter((a) => a.slot_time && istDateKey(a.slot_time) === selectedDate)
        .sort((a, b) => new Date(a.slot_time!).getTime() - new Date(b.slot_time!).getTime()),
    [appointments, selectedDate]
  );

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // Pinned to Asia/Kolkata (matching istDateKey, which selectedDate is
  // keyed by) rather than left to the runtime's local timezone -- without
  // an explicit zone, these can render a different calendar date on the
  // server (SSR) vs the admin's browser (hydration).
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
  const selectedDateLabel = new Date(`${selectedDate}T00:00:00+05:30`).toLocaleDateString("en-IN", {
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

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-lg text-slate-800">Calendar &amp; Session Log</h2>
          <p className="text-xs text-slate-500 mt-1">
            Select a date to see every session booked that day.
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
          const count = countByDate.get(key) ?? 0;
          const isSelected = key === selectedDate;
          const isToday = key === todayKey();
          return (
            <button
              key={day}
              onClick={() => setSelectedDate(key)}
              className={`relative p-2.5 rounded-lg border text-xs font-semibold transition ${
                isSelected
                  ? "bg-teal-700 text-white border-teal-700"
                  : isToday
                  ? "border-teal-400 text-slate-800"
                  : "border-slate-200 text-slate-700 hover:border-teal-300"
              }`}
            >
              {day}
              {count > 0 && (
                <span
                  className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
                    isSelected ? "bg-white" : "bg-teal-500"
                  }`}
                ></span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-xs font-semibold text-slate-600 mt-6">
        Showing sessions for {selectedDateLabel}
        {(viewYear !== Number(selectedDate.split("-")[0]) ||
          viewMonth !== Number(selectedDate.split("-")[1]) - 1) && (
          <span className="text-slate-400 font-normal"> (not in the month shown above)</span>
        )}
      </p>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-3 font-semibold">Session ID</th>
              <th className="py-2 pr-3 font-semibold">Therapist</th>
              <th className="py-2 pr-3 font-semibold">Slot</th>
              <th className="py-2 pr-3 font-semibold">Patient</th>
              <th className="py-2 pr-3 font-semibold">Category</th>
              <th className="py-2 pr-3 font-semibold">Status</th>
              <th className="py-2 pr-3 font-semibold">Join</th>
            </tr>
          </thead>
          <tbody>
            {sessionsForSelectedDate.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-400">
                  No sessions booked for this date.
                </td>
              </tr>
            ) : (
              sessionsForSelectedDate.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => setSelectedAppointment(a)}
                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition"
                >
                  <td className="py-2 pr-3 text-slate-400 font-mono">{a.session_code ?? "—"}</td>
                  <td className="py-2 pr-3 font-bold text-slate-900">
                    {a.therapist_id ? peopleMap.get(a.therapist_id) ?? "Unknown" : "Unassigned"}
                    {!a.therapist_id && a.status !== "cancelled" && (
                      // Same affordance as the All Sessions row: the click
                      // that opens the drawer is also the click that leads
                      // to the assignment, so say so rather than leaving
                      // "Unassigned" as a bare statement of fact.
                      <span className="ml-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        Tap to assign
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-slate-600 whitespace-nowrap">
                    {formatSlotRange(
                      a.slot_time,
                      a.duration_minutes ?? BASE_DURATION_MINUTES
                    )}
                  </td>
                  <td className="py-2 pr-3 text-slate-600">
                    {peopleMap.get(a.patient_id) ?? "Unknown"}
                  </td>
                  <td className="py-2 pr-3 text-slate-500">
                    {a.category_id ? categoryMap.get(a.category_id)?.title ?? "—" : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`capitalize font-semibold px-2 py-1 rounded-full ${
                        STATUS_STYLES[a.status] ?? "text-slate-600 bg-slate-100"
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3" onClick={(e) => e.stopPropagation()}>
                    <JoinSessionButton
                      meetLink={a.meet_link}
                      slotTime={a.slot_time}
                      status={a.status}
                      durationMinutes={a.duration_minutes}
                      alwaysActive
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedAppointment && (
        <SessionDetailDrawer
          canSeeMoney={canSeeMoney}
          canManageSessions={canManageSessions}
          appointment={selectedAppointment}
          peopleMap={peopleMap}
          categoryMap={categoryMap}
          therapists={therapists}
          categories={categories}
          reassignmentLogs={reassignmentLogs}
          homeVisit={homeVisitMap.get(selectedAppointment.id) ?? null}
          onClose={() => setSelectedAppointment(null)}
        />
      )}
    </div>
  );
}
