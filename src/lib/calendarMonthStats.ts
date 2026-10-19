// The counts under the Sessions screen's Calendar view, for one month.
//
// The Calendar used to count a session as "coming up" from its status alone
// (confirmed or requested), so a confirmed session from earlier in the month
// that nobody had marked done sat under Past in the List view and, one tap
// away on the same screen, read "1 session coming up this month". Both views
// now ask `sessionBucket` -- the List's own rule -- so they cannot disagree
// about what is upcoming. Dependency-free so it can be tested without
// rendering.
import { istDateKey } from "./formatSlotRange";
import { sessionBucket } from "./sessionBucket";

export type CalendarStatsSession = {
  slot_time: string | null;
  status: string;
  no_show?: boolean;
};

export type MonthCounts = {
  /** Excludes no-shows: not showing up is not progress. */
  completedCount: number;
  /** Exactly what the List view files under Upcoming, within this month. */
  upcomingCount: number;
  cancelledCount: number;
};

/** `month` is 0-indexed; the month is the clinic's (IST) calendar month. */
export function calendarMonthCounts(
  sessions: CalendarStatsSession[],
  year: number,
  month: number,
  nowMs: number
): MonthCounts {
  let completedCount = 0;
  let upcomingCount = 0;
  let cancelledCount = 0;
  for (const s of sessions) {
    if (!s.slot_time) continue;
    const [y, m] = istDateKey(s.slot_time).split("-");
    if (Number(y) !== year || Number(m) - 1 !== month) continue;
    if (s.status === "completed") {
      if (!s.no_show) completedCount += 1;
      continue;
    }
    const bucket = sessionBucket({ status: s.status, slotTime: s.slot_time }, nowMs);
    if (bucket === "cancelled") cancelledCount += 1;
    else if (bucket === "upcoming") upcomingCount += 1;
  }
  return { completedCount, upcomingCount, cancelledCount };
}
