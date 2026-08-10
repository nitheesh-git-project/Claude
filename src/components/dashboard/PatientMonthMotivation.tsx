"use client";

import Link from "next/link";
import type { MonthStats } from "@/components/dashboard/SessionCalendarTab";
import { BOOKING_FROM_DASHBOARD } from "@/components/BookingBackToSessions";

// Patient-only motivational block shown below the Calendar tab's tap-a-date
// list, tied to whichever month is currently displayed so it updates as they
// browse Previous/Next Month. No-show sessions are excluded from
// "completed" here (see SessionCalendarTab's own comment) since not showing
// up isn't progress, even though the calendar day itself still colors green
// for it. Lives as its own client component (rather than a function passed
// down from the dashboard page) because a Server Component can't pass a
// render function across the RSC boundary to SessionCalendarTab -- only
// serializable props like this `stats` object can.
export default function PatientMonthMotivation({ stats }: { stats: MonthStats }) {
  const { monthLabel, isCurrentMonth, isPastMonth, completedCount, upcomingCount } = stats;

  if (isCurrentMonth) {
    if (completedCount > 0) {
      return (
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 text-center">
          <p className="text-sm font-bold text-teal-900">
            🎉 You&apos;ve completed {completedCount} session{completedCount === 1 ? "" : "s"} this month!
          </p>
          <p className="text-xs text-teal-700 mt-1">
            Every session brings you closer to feeling your best.
          </p>
          <div className="flex items-center justify-center gap-1.5 mt-3">
            {Array.from({ length: completedCount }, (_, i) => (
              <i key={i} className="fa-solid fa-circle-check text-teal-600"></i>
            ))}
          </div>
          {upcomingCount > 0 && (
            <p className="text-xs text-teal-700 mt-3">
              +{upcomingCount} more session{upcomingCount === 1 ? "" : "s"} coming up.
            </p>
          )}
        </div>
      );
    }
    if (upcomingCount > 0) {
      return (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
          <p className="text-sm font-bold text-slate-800">
            You have {upcomingCount} session{upcomingCount === 1 ? "" : "s"} coming up this month.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Keep it up — consistency is key to recovery!
          </p>
        </div>
      );
    }
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
        <p className="text-sm font-bold text-slate-800">
          You haven&apos;t booked a session this month yet.
        </p>
        <p className="text-xs text-slate-500 mt-1 mb-3">
          Book one today to keep your recovery moving forward!
        </p>
        {/* ?from=dashboard so Back off the booking page returns to Your
            Sessions rather than wherever history happens to point -- see
            BookingBackToSessions. */}
        <Link
          href={BOOKING_FROM_DASHBOARD}
          className="inline-block bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
        >
          Book New Session
        </Link>
      </div>
    );
  }

  if (isPastMonth) {
    if (completedCount > 0) {
      return (
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 text-center">
          <p className="text-sm font-bold text-teal-900">
            <span className="inline-block animate-bounce">🎉</span> Great job! You completed{" "}
            {completedCount} session{completedCount === 1 ? "" : "s"} in {monthLabel}.
          </p>
          <p className="text-xs text-teal-700 mt-1">Keep that momentum going!</p>
        </div>
      );
    }
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
        <p className="text-sm font-semibold text-slate-700">
          No completed sessions in {monthLabel}.
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Book your next one to get back on track!
        </p>
      </div>
    );
  }

  // Future month: neutral tone either way, but still needs to reflect a
  // real booking if one exists that far out (e.g. a session booked 2+
  // months ahead) rather than always claiming nothing's booked.
  if (upcomingCount > 0) {
    return (
      <p className="text-xs text-slate-500 text-center">
        You have {upcomingCount} session{upcomingCount === 1 ? "" : "s"} scheduled for {monthLabel}.
      </p>
    );
  }
  return (
    <p className="text-xs text-slate-400 text-center">Nothing booked for {monthLabel} yet.</p>
  );
}
