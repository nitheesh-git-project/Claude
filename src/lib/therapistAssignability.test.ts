import { describe, expect, it } from "vitest";
import { assignabilityReasons } from "./therapistAssignability";

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
