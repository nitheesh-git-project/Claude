"use client";

import { useMemo, useState, type ReactNode } from "react";
import { istDateKey } from "@/lib/formatSlotRange";
import PatientMonthMotivation from "@/components/dashboard/PatientMonthMotivation";

// Minimal shape SessionCalendarTab needs to color/group by date. Field
// names match the DB columns directly (slot_time, no_show) rather than
// camelCasing them -- same convention this codebase's other
// appointment-shaped types already use (e.g. AdminCalendarTab's
// SessionDetailAppointment) -- so the patient/therapist dashboards' own
// richer `appointments` arrays satisfy this type as-is, with zero mapping
// needed at the call site.
export type CalendarSession = {
  id: string;
  slot_time: string | null;
  status: string;
  no_show?: boolean;
};

export type MonthStats = {
  year: number;
  month: number; // 0-indexed
  monthLabel: string;
  isCurrentMonth: boolean;
  isPastMonth: boolean;
  isFutureMonth: boolean;
  // Excludes no-show sessions -- a no-show wasn't actually attended, so it
  // shouldn't read as progress in a motivational count even though it still
  // counts as "completed" for the calendar's own coloring below.
  completedCount: number;
  upcomingCount: number;
  cancelledCount: number;
};

type ColorBucket = "upcoming" | "completed" | "cancelled";

function todayKey() {
  return istDateKey(new Date().toISOString());
}

// "upcoming" also covers 'requested' -- both just mean "hasn't happened
// yet", and this calendar follows an explicit 3-color spec (grey/green/red)
// with no 4th color for a pending-assignment session.
function colorBucket(status: string): ColorBucket | null {
  if (status === "cancelled") return "cancelled";
  if (status === "completed") return "completed";
  if (status === "confirmed" || status === "requested") return "upcoming";
  return null;
}

const BUCKET_DOT_COLOR: Record<ColorBucket, string> = {
  upcoming: "bg-slate-400",
  completed: "bg-green-500",
  cancelled: "bg-red-500",
};

const BUCKET_FILL_STYLE: Record<ColorBucket, string> = {
  upcoming: "bg-slate-100 border-slate-300 text-slate-700",
  completed: "bg-green-100 border-green-300 text-green-800",
  cancelled: "bg-red-100 border-red-300 text-red-800",
};

export default function SessionCalendarTab<T extends CalendarSession>({
  sessions,
  cardsById,
  showMotivation,
}: {
  sessions: T[];
  // Pre-rendered per-session cards, keyed by session id. This component is
  // a Client Component but its callers (patient/therapist dashboard pages)
  // are Server Components -- a function/closure prop can't cross that RSC
  // boundary, only serializable data (which includes pre-rendered React
  // elements) can, so the caller renders each card server-side and hands
  // over the finished JSX instead of a render function.
  cardsById: Record<string, ReactNode>;
  // Patient-only -- omitted entirely by the therapist dashboard, which is
  // purely informational. A plain boolean crosses the RSC boundary fine;
  // the motivational copy itself lives in PatientMonthMotivation, a
  // client-to-client child so no function prop is needed for it either.
  showMotivation?: boolean;
}) {
  const initial = todayKey();
  const [initYear, initMonthStr] = initial.split("-");
  const [viewYear, setViewYear] = useState(Number(initYear));
  const [viewMonth, setViewMonth] = useState(Number(initMonthStr) - 1); // 0-indexed
  const [selectedDate, setSelectedDate] = useState(initial);

  const bucketsByDate = useMemo(() => {
    const map = new Map<string, Set<ColorBucket>>();
    for (const s of sessions) {
      if (!s.slot_time) continue;
      const bucket = colorBucket(s.status);
      if (!bucket) continue;
      const key = istDateKey(s.slot_time);
      const set = map.get(key) ?? new Set<ColorBucket>();
      set.add(bucket);
      map.set(key, set);
    }
    return map;
  }, [sessions]);

  const sessionsForSelectedDate = useMemo(
    () =>
      sessions
        .filter((s) => s.slot_time && istDateKey(s.slot_time) === selectedDate)
        .sort((a, b) => new Date(a.slot_time as string).getTime() - new Date(b.slot_time as string).getTime()),
    [sessions, selectedDate]
  );

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // How many blank cells before the 1st, so a date sits under its own
  // weekday. Without this the grid was seven-wide but weekday-agnostic --
  // "the 21st" told you nothing about which day of the week you were
  // looking at, which is most of what a calendar is for.
  const leadingBlanks = new Date(viewYear, viewMonth, 1).getDay();
  // Pinned to Asia/Kolkata (matching istDateKey, which selectedDate/viewYear/
  // viewMonth are keyed against) rather than left to the runtime's local
  // timezone -- without an explicit zone, these can render a different
  // calendar date on the server (SSR) vs the browser (hydration). Same
  // reasoning as AdminCalendarTab's identical comment.
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

  const monthStats = useMemo<MonthStats>(() => {
    const [todayYearStr, todayMonthStr] = todayKey().split("-");
    const todayYear = Number(todayYearStr);
    const todayMonth = Number(todayMonthStr) - 1;
    const isCurrentMonth = viewYear === todayYear && viewMonth === todayMonth;
    const isPastMonth = viewYear < todayYear || (viewYear === todayYear && viewMonth < todayMonth);

    let completedCount = 0;
    let upcomingCount = 0;
    let cancelledCount = 0;
    for (const s of sessions) {
      if (!s.slot_time) continue;
      const [y, m] = istDateKey(s.slot_time).split("-");
      if (Number(y) !== viewYear || Number(m) - 1 !== viewMonth) continue;
      if (s.status === "completed") {
        if (!s.no_show) completedCount += 1;
      } else if (s.status === "confirmed" || s.status === "requested") {
        upcomingCount += 1;
      } else if (s.status === "cancelled") {
        cancelledCount += 1;
      }
    }

    return {
      year: viewYear,
      month: viewMonth,
      monthLabel,
      isCurrentMonth,
      isPastMonth,
      isFutureMonth: !isCurrentMonth && !isPastMonth,
      completedCount,
      upcomingCount,
      cancelledCount,
    };
  }, [sessions, viewYear, viewMonth, monthLabel]);

  return (
    /* No card chrome of its own: this always renders inside the Sessions
       screen's SurfaceCard, and a bordered box inside a bordered box reads
       as two separate things. */
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => goToMonth(-1)}
          className="text-slate-500 hover:text-slate-800 px-2 py-1 text-xs font-semibold"
        >
          <i className="fa-solid fa-chevron-left mr-1.5"></i>Previous Month
        </button>
        <p className="font-bold text-slate-800 text-sm">{monthLabel}</p>
        <button
          onClick={() => goToMonth(1)}
          className="text-slate-500 hover:text-slate-800 px-2 py-1 text-xs font-semibold"
        >
          Next Month<i className="fa-solid fa-chevron-right ml-1.5"></i>
        </button>
      </div>

      <div className="flex items-center gap-4 mb-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-slate-300"></span>Confirmed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-400"></span>Completed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-400"></span>Cancelled
        </span>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <span key={d} className="text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {d.slice(0, 1)}
            <span className="hidden sm:inline">{d.slice(1)}</span>
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <span key={`blank-${i}`} aria-hidden />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const key = dateKeyFor(day);
          const buckets = [...(bucketsByDate.get(key) ?? [])];
          const isSelected = key === selectedDate;
          const isToday = key === todayKey();
          const singleBucket = buckets.length === 1 ? buckets[0] : null;
          const baseClasses = isSelected
            ? "bg-teal-700 text-white border-teal-700"
            : singleBucket
            ? BUCKET_FILL_STYLE[singleBucket]
            : "border-slate-200 text-slate-700 hover:border-teal-300";
          const todayRing = isToday && !isSelected ? "ring-2 ring-teal-400 ring-offset-1" : "";
          return (
            <button
              key={day}
              onClick={() => setSelectedDate(key)}
              className={`relative p-2.5 rounded-lg border text-xs font-semibold transition ${baseClasses} ${todayRing}`}
            >
              {day}
              {buckets.length > 1 && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                  {buckets.map((b) => (
                    <span key={b} className={`w-1.5 h-1.5 rounded-full ${BUCKET_DOT_COLOR[b]}`}></span>
                  ))}
                </span>
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

      {sessionsForSelectedDate.length === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center">No sessions on this date.</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {sessionsForSelectedDate.map((s) => (
            <li key={s.id}>{cardsById[s.id]}</li>
          ))}
        </ul>
      )}

      {showMotivation && (
        <div className="mt-6">
          <PatientMonthMotivation stats={monthStats} />
        </div>
      )}
    </div>
  );
}
