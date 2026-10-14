import { describe, expect, it } from "vitest";
import { assignabilityFromRoster, assignabilityReasons } from "./therapistAssignability";

const base = {
  onLeave: false,
  weeklyHourCount: 20,
  slotState: "available" as const,
  hourLabel: "6 PM - 7 PM",
  dateLabel: "12 Oct 2026",
  alreadyBooked: false,
};

describe("assignabilityReasons", () => {
  it("lets a working, free therapist through", () => {
    expect(assignabilityReasons(base)).toEqual([]);
    expect(assignabilityReasons({ ...base, slotState: "override_available" })).toEqual([]);
  });

  it("names every reason at once", () => {
    const reasons = assignabilityReasons({
      ...base,
      onLeave: true,
      slotState: "unavailable",
      alreadyBooked: true,
    });
    expect(reasons.map((r) => r.code)).toEqual(["on_leave", "not_working_that_hour", "already_booked"]);
  });

  it("says no schedule was filled rather than 'not working that hour'", () => {
    const reasons = assignabilityReasons({ ...base, weeklyHourCount: 0, slotState: "unavailable" });
    expect(reasons.map((r) => r.code)).toEqual(["no_schedule"]);
  });

  it("lets a one-off extra hour stand in for an empty weekly schedule", () => {
    expect(assignabilityReasons({ ...base, weeklyHourCount: 0, slotState: "override_available" })).toEqual([]);
  });

  it("treats a time outside bookable hours as not working", () => {
    expect(assignabilityReasons({ ...base, slotState: null }).map((r) => r.code)).toEqual([
      "not_working_that_hour",
    ]);
  });
});

describe("assignabilityFromRoster", () => {
  // Thu 12 Nov 2026, 6 PM IST.
  const slot = "2026-11-12T12:30:00Z";
  const thursday = 4;
  const roster = {
    slotTime: slot,
    durationMinutes: 60,
    onLeave: false,
    template: [{ day_of_week: thursday, hour: 18 }],
    overrides: [] as { date: string; hour: number; available: boolean }[],
    bookings: [] as { id: string; slot_time: string | null; duration_minutes: number | null; status: string }[],
  };

  it("is free when rostered and not booked", () => {
    expect(assignabilityFromRoster(roster)).toEqual([]);
  });

  it("says not working when the hour is off the template", () => {
    const blocks = assignabilityFromRoster({ ...roster, template: [{ day_of_week: thursday, hour: 9 }] });
    expect(blocks.map((b) => b.code)).toEqual(["not_working_that_hour"]);
  });

  it("honours a one-off exception that closes the hour, and one that opens it", () => {
    expect(
      assignabilityFromRoster({
        ...roster,
        overrides: [{ date: "2026-11-12", hour: 18, available: false }],
      }).map((b) => b.code)
    ).toEqual(["not_working_that_hour"]);
    expect(
      assignabilityFromRoster({
        ...roster,
        template: [],
        overrides: [{ date: "2026-11-12", hour: 18, available: true }],
      })
    ).toEqual([]);
  });

  it("sees an overlapping session, but not a cancelled one or the session itself", () => {
    const clash = { id: "other", slot_time: "2026-11-12T12:00:00Z", duration_minutes: 60, status: "confirmed" };
    expect(assignabilityFromRoster({ ...roster, bookings: [clash] }).map((b) => b.code)).toEqual([
      "already_booked",
    ]);
    expect(assignabilityFromRoster({ ...roster, bookings: [{ ...clash, status: "cancelled" }] })).toEqual([]);
    expect(
      assignabilityFromRoster({
        ...roster,
        excludeAppointmentId: "self",
        bookings: [{ ...clash, id: "self" }],
      })
    ).toEqual([]);
  });

  it("pads a home visit by the travel buffer", () => {
    // Ends 5:30 PM, the visit starts 6 PM: clear online, a clash with 45
    // minutes of travel either side.
    const earlier = { id: "o", slot_time: "2026-11-12T11:30:00Z", duration_minutes: 30, status: "confirmed" };
    expect(assignabilityFromRoster({ ...roster, bookings: [earlier] })).toEqual([]);
    expect(
      assignabilityFromRoster({ ...roster, bookings: [earlier], bufferMinutes: 45 }).map((b) => b.code)
    ).toEqual(["already_booked"]);
  });

  it("says on leave", () => {
    expect(assignabilityFromRoster({ ...roster, onLeave: true }).map((b) => b.code)).toEqual(["on_leave"]);
  });
});
