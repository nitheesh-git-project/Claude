import { describe, it, expect } from "vitest";
import { openSlotPredicate, openSlotStarts, addDaysToKey, type RosterTherapist } from "./openHours";
import { zonedSlotMs, CLINIC_TIMEZONE } from "./bookingSlots";
import { assignabilityFromRoster } from "./therapistAssignability";
import { AVAILABILITY_HOURS } from "./therapistAvailability";

// 2026-11-27 is a Friday, 2026-11-29 a Sunday.
const weekdays9to5 = [1, 2, 3, 4, 5, 6].flatMap((d) =>
  [9, 10, 11, 12, 13, 14, 15, 16].map((hour) => ({ day_of_week: d, hour }))
);
const pooja: RosterTherapist = {
  id: "t1",
  onLeave: false,
  template: weekdays9to5,
  overrides: [],
  bookings: [],
};
const NOW = Date.parse("2026-11-26T00:00:00Z");
const at = (dateKey: string, hour: number) => zonedSlotMs(dateKey, hour, "Asia/Kolkata")!;

describe("open hours", () => {
  it("offers only the hours a therapist works", () => {
    const open = openSlotStarts({ fromDateKey: "2026-11-27", days: 1, therapists: [pooja], durationMinutes: 60, nowMs: NOW });
    expect(open).toContain(at("2026-11-27", 9));
    expect(open).toContain(at("2026-11-27", 16));
    expect(open).not.toContain(at("2026-11-27", 8));
    expect(open).not.toContain(at("2026-11-27", 17));
    expect(open).toHaveLength(8);
  });

  it("offers nothing on a day nobody works", () => {
    const open = openSlotStarts({ fromDateKey: "2026-11-29", days: 1, therapists: [pooja], durationMinutes: 60, nowMs: NOW });
    expect(open).toEqual([]);
  });

  it("closes an hour the only therapist is already booked for", () => {
    const booked = { ...pooja, bookings: [{ id: "a1", slot_time: new Date(at("2026-11-27", 10)).toISOString(), duration_minutes: 60, status: "confirmed" }] };
    const open = openSlotStarts({ fromDateKey: "2026-11-27", days: 1, therapists: [booked], durationMinutes: 60, nowMs: NOW });
    expect(open).not.toContain(at("2026-11-27", 10));
    expect(open).toContain(at("2026-11-27", 11));
  });

  it("keeps it open when a second therapist is free", () => {
    const booked = { ...pooja, bookings: [{ id: "a1", slot_time: new Date(at("2026-11-27", 10)).toISOString(), duration_minutes: 60, status: "confirmed" }] };
    const other = { ...pooja, id: "t2" };
    const open = openSlotStarts({ fromDateKey: "2026-11-27", days: 1, therapists: [booked, other], durationMinutes: 60, nowMs: NOW });
    expect(open).toContain(at("2026-11-27", 10));
  });

  it("closes everything while the only therapist is on leave", () => {
    const away = { ...pooja, onLeave: true };
    expect(openSlotStarts({ fromDateKey: "2026-11-27", days: 3, therapists: [away], durationMinutes: 60, nowMs: NOW })).toEqual([]);
  });

  it("opens an hour a one-off exception adds", () => {
    const extra = { ...pooja, overrides: [{ date: "2026-11-29", hour: 10, available: true }] };
    expect(openSlotStarts({ fromDateKey: "2026-11-29", days: 1, therapists: [extra], durationMinutes: 60, nowMs: NOW })).toEqual([at("2026-11-29", 10)]);
  });

  it("leaves out the past", () => {
    const now = at("2026-11-27", 12);
    const open = openSlotStarts({ fromDateKey: "2026-11-27", days: 1, therapists: [pooja], durationMinutes: 60, nowMs: now });
    expect(open[0]).toBe(at("2026-11-27", 13));
  });

  it("answers 'not checked' as every hour", () => {
    expect(openSlotPredicate(null)).toBeNull();
    const p = openSlotPredicate([at("2026-11-27", 9)])!;
    expect(p(at("2026-11-27", 9))).toBe(true);
    expect(p(at("2026-11-27", 10))).toBe(false);
  });

  it("walks calendar days", () => {
    expect(addDaysToKey("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("openSlotStarts gives the assign rule's answer, slot for slot", () => {
  // The loop shares each therapist's day across its hours for speed; this
  // pins it to assignabilityFromRoster asked one slot at a time, the way it
  // was written before, over a roster with every kind of fact in it.
  it("matches assignabilityFromRoster on a mixed roster", () => {
    const weekdays: { day_of_week: number; hour: number }[] = [];
    for (let d = 1; d <= 5; d++) for (let h = 9; h < 18; h++) weekdays.push({ day_of_week: d, hour: h });
    const evenings = [2, 4, 6].flatMap((d) => [17, 18, 19, 20].map((h) => ({ day_of_week: d, hour: h })));
    const therapists: RosterTherapist[] = [
      {
        id: "a",
        onLeave: false,
        template: weekdays,
        overrides: [
          { date: "2026-12-01", hour: 10, available: false },
          { date: "2026-12-06", hour: 11, available: true },
        ],
        bookings: [
          { id: "b1", slot_time: "2026-12-02T04:30:00.000Z", duration_minutes: 60, status: "confirmed" },
          { id: "b2", slot_time: "2026-12-03T05:00:00.000Z", duration_minutes: 90, status: "requested" },
          { id: "b3", slot_time: "2026-12-04T04:30:00.000Z", duration_minutes: 60, status: "cancelled" },
        ],
      },
      { id: "b", onLeave: false, template: evenings, overrides: [], bookings: [] },
      { id: "c", onLeave: true, template: weekdays, overrides: [], bookings: [] },
      { id: "d", onLeave: false, template: [], overrides: [{ date: "2026-12-07", hour: 8, available: true }], bookings: [] },
    ];
    const nowMs = Date.parse("2026-11-30T06:15:00.000Z");
    const fast = openSlotStarts({ fromDateKey: "2026-11-30", days: 14, therapists, durationMinutes: 60, nowMs });
    const slow: number[] = [];
    for (let i = 0; i < 14; i++) {
      const dateKey = addDaysToKey("2026-11-30", i);
      for (const hour of AVAILABILITY_HOURS) {
        const ms = zonedSlotMs(dateKey, hour, CLINIC_TIMEZONE);
        if (ms === null || ms <= nowMs) continue;
        const free = therapists.some(
          (t) =>
            assignabilityFromRoster({
              slotTime: new Date(ms).toISOString(),
              durationMinutes: 60,
              onLeave: t.onLeave,
              template: t.template,
              overrides: t.overrides,
              bookings: t.bookings,
            }).length === 0
        );
        if (free) slow.push(ms);
      }
    }
    expect(fast.length).toBeGreaterThan(0);
    expect(fast).toEqual(slow);
  });
});

describe("openSlotStarts with a home-visit buffer and a session being moved", () => {
  it("matches assignabilityFromRoster given the same buffer and exclusion", () => {
    const template: { day_of_week: number; hour: number }[] = [];
    for (let d = 1; d <= 6; d++) for (let h = 9; h < 19; h++) template.push({ day_of_week: d, hour: h });
    const therapists: RosterTherapist[] = [
      {
        id: "a",
        onLeave: false,
        template,
        overrides: [],
        bookings: [
          { id: "moving", slot_time: "2026-12-01T05:30:00.000Z", duration_minutes: 60, status: "confirmed" },
          { id: "other", slot_time: "2026-12-02T08:30:00.000Z", duration_minutes: 60, status: "confirmed" },
        ],
      },
    ];
    const nowMs = Date.parse("2026-11-30T06:15:00.000Z");
    const opts = { bufferMinutes: 30, excludeAppointmentId: "moving" };
    const fast = openSlotStarts({ fromDateKey: "2026-11-30", days: 7, therapists, durationMinutes: 60, nowMs, ...opts });
    const slow: number[] = [];
    for (let i = 0; i < 7; i++) {
      const dateKey = addDaysToKey("2026-11-30", i);
      for (const hour of AVAILABILITY_HOURS) {
        const ms = zonedSlotMs(dateKey, hour, CLINIC_TIMEZONE);
        if (ms === null || ms <= nowMs) continue;
        const t = therapists[0];
        const free =
          assignabilityFromRoster({
            slotTime: new Date(ms).toISOString(),
            durationMinutes: 60,
            onLeave: false,
            template: t.template,
            overrides: t.overrides,
            bookings: t.bookings,
            ...opts,
          }).length === 0;
        if (free) slow.push(ms);
      }
    }
    expect(fast).toEqual(slow);
    // The session being moved does not block its own hour (11:00 IST)...
    expect(fast).toContain(Date.parse("2026-12-01T05:30:00.000Z"));
    // ...while the buffer closes the hours either side of another visit.
    expect(fast).not.toContain(Date.parse("2026-12-02T07:30:00.000Z"));
    expect(fast).not.toContain(Date.parse("2026-12-02T09:30:00.000Z"));
  });
});
