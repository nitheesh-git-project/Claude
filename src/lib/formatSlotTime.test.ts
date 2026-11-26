import { describe, it, expect } from "vitest";
import { formatSlotTime } from "./formatSlotTime";

describe("formatSlotTime", () => {
  const slot = "2026-11-27T10:00:00.000Z"; // 3:30 pm IST

  it("prints a clinic-zone slot in the app's one style", () => {
    expect(formatSlotTime(slot, "Asia/Kolkata")).toBe("27 Nov 2026, 3:30 pm");
  });

  it("names another zone and gives the clinic's time beside it", () => {
    expect(formatSlotTime(slot, "UTC")).toBe("27 Nov 2026, 10:00 am UTC (3:30 pm IST)");
  });

  it("treats a missing or unknown zone as the clinic's", () => {
    expect(formatSlotTime(slot, null)).toBe("27 Nov 2026, 3:30 pm");
    expect(formatSlotTime(slot, "Not/AZone")).toBe("27 Nov 2026, 3:30 pm");
  });

  it("says so when there is no slot", () => {
    expect(formatSlotTime(null, "Asia/Kolkata")).toBe("Slot to be confirmed");
    expect(formatSlotTime("nonsense", "Asia/Kolkata")).toBe("Slot to be confirmed");
  });
});
