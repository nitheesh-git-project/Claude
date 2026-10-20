import { describe, expect, it } from "vitest";
import { calendarMonthCounts } from "./calendarMonthStats";
import { sessionBucket } from "./sessionBucket";

// 19 October 2026, 15:30 IST.
const NOW = Date.parse("2026-10-19T10:00:00Z");
const at = (h: number) => new Date(NOW + h * 3_600_000).toISOString();
const OCT = { year: 2026, month: 9 };

describe("calendarMonthCounts", () => {
  it("does not count a past confirmed session as coming up (F-02)", () => {
    const sessions = [{ slot_time: at(-24 * 5), status: "confirmed" }];
    const counts = calendarMonthCounts(sessions, OCT.year, OCT.month, NOW);
    expect(counts.upcomingCount).toBe(0);
    // The List view's own rule says the same thing.
    expect(sessionBucket({ status: "confirmed", slotTime: sessions[0].slot_time }, NOW)).toBe("past");
  });

  it("counts a future open session, and one still inside its grace day", () => {
    const sessions = [
      { slot_time: at(48), status: "confirmed" },
      { slot_time: at(2), status: "requested" },
      { slot_time: at(-1), status: "confirmed" },
    ];
    expect(calendarMonthCounts(sessions, OCT.year, OCT.month, NOW).upcomingCount).toBe(3);
  });

  it("agrees with sessionBucket for every row in the month", () => {
    const sessions = [-200, -30, -20, -1, 1, 30, 200].flatMap((h) =>
      ["requested", "confirmed", "completed", "cancelled"].map((status) => ({
        slot_time: at(h),
        status,
      }))
    );
    const inOctober = sessions.filter((s) => s.slot_time.startsWith("2026-10"));
    const expected = inOctober.filter(
      (s) => sessionBucket({ status: s.status, slotTime: s.slot_time }, NOW) === "upcoming"
    ).length;
    expect(calendarMonthCounts(sessions, OCT.year, OCT.month, NOW).upcomingCount).toBe(expected);
  });

  it("keeps no-shows out of completed and counts cancellations", () => {
    const sessions = [
      { slot_time: at(-48), status: "completed" },
      { slot_time: at(-72), status: "completed", no_show: true },
      { slot_time: at(-96), status: "cancelled" },
    ];
    expect(calendarMonthCounts(sessions, OCT.year, OCT.month, NOW)).toEqual({
      completedCount: 1,
      upcomingCount: 0,
      cancelledCount: 1,
    });
  });

  it("buckets by the clinic's month, not UTC's", () => {
    // 31 Oct 20:00 UTC is 1 Nov 01:30 IST.
    const sessions = [{ slot_time: "2026-10-31T20:00:00Z", status: "confirmed" }];
    expect(calendarMonthCounts(sessions, 2026, 9, NOW).upcomingCount).toBe(0);
    expect(calendarMonthCounts(sessions, 2026, 10, NOW).upcomingCount).toBe(1);
  });
});
