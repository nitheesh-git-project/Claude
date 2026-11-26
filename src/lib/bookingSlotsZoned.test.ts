import { describe, it, expect } from "vitest";
import { wallClockMs, zonedSlotMs, zonedSlotParts, zoneLabel, isWholeHourSlot } from "./bookingSlots";

// Run under whatever zone the test runner has; the point is that the
// answers do not depend on it. CI runs these in UTC as well as IST.
describe("staff slots in a zone that is not the browser's", () => {
  it("builds 3 PM IST as 09:30 UTC, whatever the local zone", () => {
    const ms = zonedSlotMs("2026-11-27", 15, "Asia/Kolkata");
    expect(new Date(ms!).toISOString()).toBe("2026-11-27T09:30:00.000Z");
    expect(isWholeHourSlot(new Date(ms!).toISOString(), "Asia/Kolkata")).toBe(true);
  });

  it("builds an hour in the booking's own zone", () => {
    const ms = zonedSlotMs("2026-11-27", 13, "Asia/Muscat");
    expect(new Date(ms!).toISOString()).toBe("2026-11-27T09:00:00.000Z");
  });

  it("reads a stored instant back as the zone's date and hour", () => {
    expect(zonedSlotParts("2026-11-27T09:30:00.000Z", "Asia/Kolkata")).toEqual({ dateKey: "2026-11-27", hour: 15 });
    expect(zonedSlotParts("2026-11-26T19:00:00.000Z", "Asia/Kolkata")).toEqual({ dateKey: "2026-11-27", hour: 0 });
    expect(zonedSlotParts(null, "Asia/Kolkata")).toEqual({ dateKey: "", hour: null });
  });

  it("round-trips", () => {
    const ms = zonedSlotMs("2026-12-01", 18, "Asia/Kolkata")!;
    expect(zonedSlotParts(new Date(ms).toISOString(), "Asia/Kolkata")).toEqual({ dateKey: "2026-12-01", hour: 18 });
  });

  it("gives a clock whose local getters read the zone's wall time", () => {
    const wall = new Date(wallClockMs(Date.parse("2026-11-26T20:00:00Z"), "Asia/Kolkata"));
    expect([wall.getDate(), wall.getHours(), wall.getMinutes()]).toEqual([27, 1, 30]);
  });

  it("falls back to the clinic zone for an unknown one", () => {
    expect(zonedSlotMs("2026-11-27", 15, "Not/AZone")).toBe(Date.parse("2026-11-27T09:30:00Z"));
    expect(zoneLabel("Not/AZone")).toBe("India time (IST)");
    expect(zoneLabel("Asia/Muscat")).toBe("Asia/Muscat");
  });

  it("refuses an incomplete slot", () => {
    expect(zonedSlotMs("", 15)).toBeNull();
    expect(zonedSlotMs("2026-11-27", null)).toBeNull();
  });
});
