import { describe, expect, it } from "vitest";
import { describeSlotForVisitor, slotInZones } from "./slotZones";
import { formatDateTimeInZone } from "./formatDateTime";

// 10:00 UTC on 28 Nov is 3:30 pm in India.
const TEN_UTC = "2026-11-28T10:00:00.000Z";

describe("slotInZones", () => {
  it("gives both clocks to a visitor outside India", () => {
    const z = slotInZones(TEN_UTC, "UTC");
    expect(z.clinic).toMatch(/3:30/);
    expect(z.yours).toMatch(/10:00/);
    expect(z.yours).toMatch(/UTC/);
  });
  it("adds nothing for a visitor on the clinic's clock, under either name", () => {
    expect(slotInZones(TEN_UTC, "Asia/Kolkata").yours).toBeNull();
    expect(slotInZones(TEN_UTC, "Asia/Calcutta").yours).toBeNull();
  });
  it("adds nothing when the zone is missing or unknown", () => {
    expect(slotInZones(TEN_UTC, "").yours).toBeNull();
    expect(slotInZones(TEN_UTC, "Not/AZone").yours).toBeNull();
    expect(slotInZones(null, "UTC").yours).toBeNull();
  });
  it("keeps the date a day out when the zones straddle midnight", () => {
    // 20:00 UTC on the 28th is 1:30 am IST on the 29th.
    const z = slotInZones("2026-11-28T20:00:00.000Z", "UTC");
    expect(z.clinic).toMatch(/^29 /);
    expect(z.yours).toMatch(/^28 /);
  });
});

describe("describeSlotForVisitor / formatDateTimeInZone", () => {
  it("is one sentence naming both", () => {
    const text = describeSlotForVisitor(TEN_UTC, "America/New_York");
    expect(text).toMatch(/5:00 am/i);
    expect(text).toMatch(/3:30 pm/i);
    expect(text).toMatch(/India time/);
  });
  it("never uses the runtime's zone", () => {
    expect(formatDateTimeInZone(TEN_UTC, "UTC")).toMatch(/10:00/);
    expect(formatDateTimeInZone("nope", "UTC")).toBe("");
  });
});
