import { describe, expect, it } from "vitest";
import { sameClinicDay, todayProgress, todaysSessions, type TodayAppointment } from "./therapistToday";

// 24 Nov 2026, 11:10 IST = 05:40 UTC.
const NOW = Date.parse("2026-11-24T05:40:00Z");

function appt(id: string, istTime: string, p: Partial<TodayAppointment> = {}): TodayAppointment {
  return {
    id,
    patient_id: `p-${id}`,
    slot_time: new Date(Date.parse(`2026-11-24T${istTime}:00+05:30`)).toISOString(),
    status: "confirmed",
    duration_minutes: 60,
    ...p,
  };
}

describe("sameClinicDay", () => {
  it("uses the clinic's day, not UTC's", () => {
    // 00:30 IST on the 25th is still the 24th in UTC.
    expect(sameClinicDay("2026-11-24T19:00:00Z", NOW)).toBe(false);
    // 05:00 IST on the 24th is the 23rd in UTC.
    expect(sameClinicDay("2026-11-23T23:30:00Z", NOW)).toBe(true);
  });
});

describe("todaysSessions", () => {
  const rows = todaysSessions(
    [
      appt("late", "18:00", { visit: { visit_mode: "home_visit" } }),
      appt("done", "09:00", { status: "completed" }),
      appt("now", "11:00"),
      appt("next", "15:00"),
      appt("cx", "16:00", { status: "cancelled" }),
      appt("ns", "08:00", { no_show: true }),
      appt("req", "17:00", { status: "requested" }),
      { ...appt("tomorrow", "10:00"), slot_time: "2026-11-25T04:30:00Z" },
    ],
    NOW
  );

  it("lists today's sessions in time order, without cancellations or other days", () => {
    expect(rows.map((r) => r.id)).toEqual(["ns", "done", "now", "next", "req", "late"]);
  });

  it("says where each one stands", () => {
    expect(Object.fromEntries(rows.map((r) => [r.id, r.state]))).toEqual({
      ns: "no-show",
      done: "done",
      now: "now",
      next: "next",
      req: "waiting",
      late: "later",
    });
    expect(rows.find((r) => r.id === "late")?.homeVisit).toBe(true);
  });

  it("flags a past session nobody completed", () => {
    const [r] = todaysSessions([appt("old", "08:00")], NOW);
    expect(r.state).toBe("to-finish");
  });

  it("counts settled sessions for the progress bar", () => {
    expect(todayProgress(rows)).toEqual({ settled: 2, total: 6 });
  });
});
