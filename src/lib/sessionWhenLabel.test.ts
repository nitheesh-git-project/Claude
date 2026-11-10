import { describe, expect, it } from "vitest";
import { formatClinicTimeRange, formatSessionWhen } from "./sessionWhenLabel";

// 2026-10-28 18:00 in India is 12:30 UTC.
const SIX_PM_IST = "2026-10-28T12:30:00.000Z";

describe("formatSessionWhen", () => {
  it("restates the time in the clinic's zone, whatever zone the runtime is in", () => {
    expect(formatSessionWhen(SIX_PM_IST, 60)).toBe("Wed 28 Oct, 6–7 pm, with a physiotherapist");
  });

  it("drops the tail when asked for the bare date and time", () => {
    expect(formatSessionWhen(SIX_PM_IST, 60, "")).toBe("Wed 28 Oct, 6–7 pm");
  });

  it("names both halves of the day when the session crosses noon", () => {
    // 11:30 UTC is 5:00 pm IST; use 05:30 UTC = 11:00 am IST.
    expect(formatClinicTimeRange(Date.parse("2026-10-28T05:30:00.000Z"), 60)).toBe("11 am–12 pm");
  });

  it("shows minutes only when there are some", () => {
    expect(formatClinicTimeRange(Date.parse("2026-10-28T13:00:00.000Z"), 60)).toBe("6:30–7:30 pm");
    expect(formatClinicTimeRange(Date.parse(SIX_PM_IST), 45)).toBe("6–6:45 pm");
  });

  it("reads midnight and noon as 12", () => {
    expect(formatClinicTimeRange(Date.parse("2026-10-28T06:30:00.000Z"), 60)).toBe("12–1 pm");
    expect(formatClinicTimeRange(Date.parse("2026-10-28T17:30:00.000Z"), 60)).toBe("11 pm–12 am");
  });

  it("gives a dash for a time that cannot be read", () => {
    expect(formatSessionWhen("nonsense", 60)).toBe("-");
  });
});
