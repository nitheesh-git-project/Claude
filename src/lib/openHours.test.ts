import { describe, it, expect } from "vitest";
import { openSlotPredicate, openSlotStarts, addDaysToKey, type RosterTherapist } from "./openHours";
import { zonedSlotMs } from "./bookingSlots";

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
