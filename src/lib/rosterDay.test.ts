import { describe, it, expect } from "vitest";
import {
  buildRosterDay,
  summariseRosterDay,
  type RosterDayAppointment,
  type RosterDayTherapist,
} from "@/lib/rosterDay";
import type { OverrideRow, TemplateRow } from "@/lib/therapistAvailability";

// A Thursday. dayOfWeekForDateKey reads this as 4.
const DATE = "2026-09-17";
const ZONE = "Asia/Kolkata";

function therapist(overrides: Partial<RosterDayTherapist> = {}): RosterDayTherapist {
  return {
    id: "t1",
    fullName: "QA Therapist",
    specialization: "Orthopaedic",
    timezone: ZONE,
    onLeave: false,
    ...overrides,
  };
}

/** 10:00-13:00 on Thursdays, as the template stores it: one row per hour. */
function template(hours: number[], dayOfWeek = 4): TemplateRow[] {
  return hours.map((hour) => ({ day_of_week: dayOfWeek, hour }));
}

/** IST is UTC+05:30, so 10 AM IST is 04:30 UTC -- six hours back, then half an
 *  hour forward. Every slot in this app starts on the hour in the *booking's*
 *  own zone, which is exactly what that offset encodes, and getting it wrong
 *  here would test the helper rather than the module. */
function istSlot(hour: number, dateKey = DATE): string {
  return `${dateKey}T${String(hour - 6).padStart(2, "0")}:30:00.000Z`;
}

function appointment(overrides: Partial<RosterDayAppointment> = {}): RosterDayAppointment {
  return {
    id: "a1",
    therapistId: "t1",
    slotTime: istSlot(10),
    durationMinutes: 60,
    status: "confirmed",
    label: "QA Patient",
    ...overrides,
  };
}

function build(
  therapists: RosterDayTherapist[],
  templates: Record<string, TemplateRow[]>,
  overrides: Record<string, OverrideRow[]> = {},
  appointments: Record<string, RosterDayAppointment[]> = {}
) {
  return buildRosterDay(DATE, therapists, templates, overrides, appointments);
}

describe("roster day", () => {
  it("reads the weekly template as the day's working hours", () => {
    const [entry] = build([therapist()], { t1: template([10, 11, 12]) });
    expect(entry.reason).toBe("working");
    expect(entry.workingCount).toBe(3);
    expect(entry.freeCount).toBe(3);
    expect(entry.bookedCount).toBe(0);
    expect(entry.hours.filter((h) => h.state === "free").map((h) => h.hour)).toEqual([10, 11, 12]);
  });

  it("returns every hour of the day, not only the working ones", () => {
    // A strip showing the survivors alone makes a therapist who works
    // mornings look identical to one who is fully booked.
    const [entry] = build([therapist()], { t1: template([10]) });
    expect(entry.hours).toHaveLength(18);
    expect(entry.hours.filter((h) => h.state === "off")).toHaveLength(17);
  });

  it("lets a date exception win over the weekly template, both ways", () => {
    const [opened] = build(
      [therapist()],
      { t1: template([10]) },
      { t1: [{ date: DATE, hour: 15, available: true }] }
    );
    expect(opened.hours.find((h) => h.hour === 15)?.state).toBe("free");

    const [closed] = build(
      [therapist()],
      { t1: template([10, 11]) },
      { t1: [{ date: DATE, hour: 11, available: false }] }
    );
    expect(closed.hours.find((h) => h.hour === 11)?.state).toBe("off");
  });

  it("ignores an exception belonging to another date", () => {
    const [entry] = build(
      [therapist()],
      { t1: template([10]) },
      { t1: [{ date: "2026-09-18", hour: 10, available: false }] }
    );
    expect(entry.hours.find((h) => h.hour === 10)?.state).toBe("free");
  });

  it("marks an hour booked and names the session holding it", () => {
    const [entry] = build(
      [therapist()],
      { t1: template([10, 11]) },
      {},
      { t1: [appointment({ slotTime: istSlot(11), label: "Mrs Rao" })] }
    );
    expect(entry.hours.find((h) => h.hour === 10)?.state).toBe("free");
    const booked = entry.hours.find((h) => h.hour === 11);
    expect(booked?.state).toBe("booked");
    expect(booked?.appointment?.label).toBe("Mrs Rao");
    expect(entry.bookedCount).toBe(1);
    expect(entry.freeCount).toBe(1);
  });

  it("takes every hour a long session overlaps, not only the one it starts in", () => {
    // 90 minutes from 2 PM runs to 3:30, so 3 PM is gone too. Comparing start
    // times alone is how a screen offers a slot the booking route refuses.
    const [entry] = build(
      [therapist()],
      { t1: template([14, 15, 16]) },
      {},
      { t1: [appointment({ slotTime: istSlot(14), durationMinutes: 90 })] }
    );
    expect(entry.hours.find((h) => h.hour === 14)?.state).toBe("booked");
    expect(entry.hours.find((h) => h.hour === 15)?.state).toBe("booked");
    expect(entry.hours.find((h) => h.hour === 16)?.state).toBe("free");
  });

  it("treats a session with no duration as a full hour rather than none", () => {
    const [entry] = build(
      [therapist()],
      { t1: template([10]) },
      {},
      { t1: [appointment({ durationMinutes: null })] }
    );
    expect(entry.hours.find((h) => h.hour === 10)?.state).toBe("booked");
  });

  it("gives a cancelled session's hour back", () => {
    const [entry] = build(
      [therapist()],
      { t1: template([10]) },
      {},
      { t1: [appointment({ status: "cancelled" })] }
    );
    expect(entry.hours.find((h) => h.hour === 10)?.state).toBe("free");
  });

  it("names the earliest of two sessions clashing on one hour", () => {
    // Never the second, which would hide the first on the one screen an admin
    // would notice a double booking from.
    const [entry] = build(
      [therapist()],
      { t1: template([10]) },
      {},
      {
        t1: [
          appointment({ id: "late", slotTime: istSlot(10), label: "Later" }),
          appointment({ id: "early", slotTime: istSlot(8), durationMinutes: 180, label: "Earlier" }),
        ],
      }
    );
    expect(entry.hours.find((h) => h.hour === 10)?.appointment?.label).toBe("Earlier");
  });

  it("empties the day for somebody on leave without touching their schedule", () => {
    const [entry] = build([therapist({ onLeave: true })], { t1: template([10, 11, 12]) });
    expect(entry.reason).toBe("on_leave");
    expect(entry.available).toBe(false);
    expect(entry.hours.every((h) => h.state === "off")).toBe(true);
  });

  it("tells not rostered apart from on leave", () => {
    // Two different pieces of work for the admin reading it, and
    // "unavailable" alone sends them to the wrong screen.
    const [entry] = build([therapist()], { t1: template([10], 1) });
    expect(entry.reason).toBe("not_rostered");
    expect(entry.available).toBe(false);
  });

  it("ignores a session on another date", () => {
    const [entry] = build(
      [therapist()],
      { t1: template([10]) },
      {},
      { t1: [appointment({ slotTime: istSlot(10, "2026-09-18") })] }
    );
    expect(entry.hours.find((h) => h.hour === 10)?.state).toBe("free");
  });

  it("keeps the order it was given", () => {
    const entries = build(
      [therapist({ id: "b", fullName: "B" }), therapist({ id: "a", fullName: "A" })],
      { a: template([10]), b: template([10]) }
    );
    expect(entries.map((e) => e.therapist.fullName)).toEqual(["B", "A"]);
  });

  it("summarises from the entries themselves, so the count agrees with the list", () => {
    const entries = build(
      [
        therapist({ id: "a" }),
        therapist({ id: "b", onLeave: true }),
        therapist({ id: "c" }),
      ],
      { a: template([10, 11]), b: template([10]), c: template([10], 1) },
      {},
      { a: [appointment({ therapistId: "a" })] }
    );
    expect(summariseRosterDay(entries)).toEqual({
      available: 1,
      onLeave: 1,
      notRostered: 1,
      freeHours: 1,
      bookedHours: 1,
    });
  });
});
