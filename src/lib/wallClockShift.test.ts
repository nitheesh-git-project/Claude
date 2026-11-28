import { describe, expect, it } from "vitest";
import { wallClockShiftMs } from "./bookingSlots";
import { openSlotPredicate } from "./openHours";
import { zonedSlotMs } from "./bookingSlots";

describe("wallClockShiftMs", () => {
  it("is a whole number of minutes whatever the milliseconds of now", () => {
    for (const ms of [1795769852239, 1795769852000, 1795769852999]) {
      expect(wallClockShiftMs(ms, "Asia/Kolkata") % 60_000 === 0).toBe(true);
    }
  });

  it("turns the admin grid's wall-clock slot back into the exact instant it names", () => {
    // The admin grid reads a clinic date + hour as the browser's own local
    // time, then subtracts the shift to get the real instant and looks it up
    // in the open hours by exact value. Any millisecond of noise misses.
    const open = [zonedSlotMs("2026-11-28", 10, "Asia/Kolkata")!];
    const isOpen = openSlotPredicate(open)!;
    for (const nowMs of [Date.parse("2026-11-27T08:57:32.239Z"), Date.parse("2026-11-27T08:57:32.000Z")]) {
      const shift = wallClockShiftMs(nowMs, "Asia/Kolkata");
      const gridSlot = new Date("2026-11-28T10:00").getTime(); // the browser's local reading
      expect(isOpen(gridSlot - shift)).toBe(true);
    }
  });
});
