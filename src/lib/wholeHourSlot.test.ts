import { describe, it, expect } from "vitest";
import {
  CLINIC_TIMEZONE,
  isWholeHourSlot,
  slotMinuteInZone,
} from "./bookingSlots";

// 6 PM IST is 12:30 UTC. Every case below leans on that half-hour offset,
// because reading the minute off the UTC instant is exactly the mistake this
// helper exists to avoid.
const SIX_PM_IST = "2026-09-10T12:30:00.000Z";
const SIX_FIFTY_TWO_PM_IST = "2026-09-10T13:22:00.000Z";

describe("isWholeHourSlot", () => {
  it("accepts a whole hour in the clinic's timezone", () => {
    expect(isWholeHourSlot(SIX_PM_IST, CLINIC_TIMEZONE)).toBe(true);
  });

  it("accepts it with no timezone given, falling back to the clinic's", () => {
    expect(isWholeHourSlot(SIX_PM_IST)).toBe(true);
    expect(isWholeHourSlot(SIX_PM_IST, "")).toBe(true);
    expect(isWholeHourSlot(SIX_PM_IST, null)).toBe(true);
  });

  it("refuses a time typed with minutes on it", () => {
    expect(isWholeHourSlot(SIX_FIFTY_TWO_PM_IST, CLINIC_TIMEZONE)).toBe(false);
  });

  it("does not read the minute off the UTC instant", () => {
    // The same instant is :30 past the hour in UTC and :00 in IST. Judging it
    // by UTC would reject a correct booking...
    expect(isWholeHourSlot(SIX_PM_IST, CLINIC_TIMEZONE)).toBe(true);
    // ...and accept one 30 minutes out.
    expect(isWholeHourSlot("2026-09-10T13:00:00.000Z", CLINIC_TIMEZONE)).toBe(false);
  });

  it("judges a booking made in another timezone against that zone", () => {
    // 18:00 in London on a summer date is 17:00Z, which is 22:30 IST -- a
    // whole hour where it was booked, and not one in the clinic's zone.
    const sixPmLondon = "2026-09-10T17:00:00.000Z";
    expect(isWholeHourSlot(sixPmLondon, "Europe/London")).toBe(true);
    expect(isWholeHourSlot(sixPmLondon, CLINIC_TIMEZONE)).toBe(false);
  });

  it("refuses stray seconds and milliseconds", () => {
    expect(isWholeHourSlot("2026-09-10T12:30:30.000Z", CLINIC_TIMEZONE)).toBe(false);
    expect(isWholeHourSlot("2026-09-10T12:30:00.500Z", CLINIC_TIMEZONE)).toBe(false);
  });

  it("refuses an unparseable instant", () => {
    expect(isWholeHourSlot("not a date", CLINIC_TIMEZONE)).toBe(false);
    expect(isWholeHourSlot("", CLINIC_TIMEZONE)).toBe(false);
  });

  it("falls back to the clinic zone for an unknown timezone rather than passing anything", () => {
    expect(isWholeHourSlot(SIX_PM_IST, "Mars/Olympus")).toBe(true);
    expect(isWholeHourSlot(SIX_FIFTY_TWO_PM_IST, "Mars/Olympus")).toBe(false);
  });
});

describe("slotMinuteInZone", () => {
  it("reads the minute in the given zone", () => {
    expect(slotMinuteInZone(SIX_PM_IST, CLINIC_TIMEZONE)).toBe(0);
    expect(slotMinuteInZone(SIX_FIFTY_TWO_PM_IST, CLINIC_TIMEZONE)).toBe(52);
    expect(slotMinuteInZone(SIX_PM_IST, "UTC")).toBe(30);
  });

  it("is null for an unparseable instant", () => {
    expect(slotMinuteInZone("nope", CLINIC_TIMEZONE)).toBeNull();
  });
});
