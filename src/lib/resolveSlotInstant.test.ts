import { describe, expect, it } from "vitest";
import { isWholeHourSlot, resolveSlotInstant } from "./bookingSlots";

describe("resolveSlotInstant", () => {
  it("reads a zone-less wall time in the clinic's zone, not the server's", () => {
    expect(resolveSlotInstant("2026-10-07T18:00")).toBe("2026-10-07T12:30:00.000Z");
  });

  it("reads it in the booking's own zone when one is given", () => {
    expect(resolveSlotInstant("2026-10-07T18:00", "Europe/London")).toBe("2026-10-07T17:00:00.000Z");
  });

  it("keeps an instant that already carries its zone", () => {
    expect(resolveSlotInstant("2026-10-07T12:30:00.000Z", "Europe/London")).toBe("2026-10-07T12:30:00.000Z");
    expect(resolveSlotInstant("2026-10-07T18:00:00+05:30")).toBe("2026-10-07T12:30:00.000Z");
  });

  it("falls back to the clinic's zone for an unknown one", () => {
    expect(resolveSlotInstant("2026-10-07T18:00", "Not/AZone")).toBe("2026-10-07T12:30:00.000Z");
  });

  it("refuses what names no instant", () => {
    expect(resolveSlotInstant("tomorrow")).toBeNull();
    expect(resolveSlotInstant("")).toBeNull();
    expect(resolveSlotInstant(null)).toBeNull();
  });

  it("documents the bug: the raw wall time fails the rule on a UTC host", () => {
    // Under TZ=UTC (how vitest runs here and how servers run), new Date()
    // reads "18:00" as 18:00 UTC = 23:30 in India.
    if (new Date("2026-10-07T18:00").getTimezoneOffset() === 0) {
      expect(isWholeHourSlot("2026-10-07T18:00", "Asia/Kolkata")).toBe(false);
    }
  });

  it("makes the scheduler's on-the-hour picks pass the on-the-hour rule", () => {
    // The bug: on a UTC host "18:00" was 23:30 IST and every pick was refused.
    for (const hour of ["06", "09", "18", "23"]) {
      const iso = resolveSlotInstant(`2026-10-07T${hour}:00`)!;
      expect(isWholeHourSlot(iso, "Asia/Kolkata")).toBe(true);
    }
  });
});
