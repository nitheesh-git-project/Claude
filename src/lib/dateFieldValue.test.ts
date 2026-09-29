import { describe, it, expect } from "vitest";
import {
  buildDateValue,
  formatClockLabel,
  isDateKey,
  parseDateValue,
} from "@/lib/dateFieldValue";

describe("date field values", () => {
  it("round-trips a plain date exactly as the native input did", () => {
    const parts = parseDateValue("2026-09-12");
    expect(parts).toEqual({ dateKey: "2026-09-12", hour: null, minute: null });
    expect(buildDateValue(parts.dateKey, parts.hour, parts.minute, false)).toBe("2026-09-12");
  });

  it("round-trips a date and time in datetime-local's own shape", () => {
    const parts = parseDateValue("2026-09-12T14:30");
    expect(parts).toEqual({ dateKey: "2026-09-12", hour: 14, minute: 30 });
    expect(buildDateValue(parts.dateKey, parts.hour, parts.minute, true)).toBe("2026-09-12T14:30");
  });

  it("drops seconds rather than refusing the value", () => {
    // A value that went through a database or an ISO string carries them, and
    // refusing it would blank a field holding a real answer.
    expect(parseDateValue("2026-09-12T14:30:00")).toEqual({
      dateKey: "2026-09-12",
      hour: 14,
      minute: 30,
    });
  });

  it("reads nothing as nothing, never as today", () => {
    for (const bad of [null, undefined, "", "   ", "not a date", "12/09/2026"]) {
      expect(parseDateValue(bad)).toEqual({ dateKey: null, hour: null, minute: null });
    }
  });

  it("refuses a day that does not exist", () => {
    // Digits alone are not a date: a picker that accepted 31 February would
    // open on the wrong month.
    expect(isDateKey("2026-02-31")).toBe(false);
    expect(isDateKey("2026-13-01")).toBe(false);
    expect(isDateKey("2026-00-10")).toBe(false);
    expect(isDateKey("2026-02-28")).toBe(true);
    // 2028 is a leap year, 2026 is not.
    expect(isDateKey("2028-02-29")).toBe(true);
    expect(isDateKey("2026-02-29")).toBe(false);
  });

  it("keeps a usable date when only the time is unreadable", () => {
    expect(parseDateValue("2026-09-12Tnonsense")).toEqual({
      dateKey: "2026-09-12",
      hour: null,
      minute: null,
    });
    expect(parseDateValue("2026-09-12T25:00")).toEqual({
      dateKey: "2026-09-12",
      hour: null,
      minute: null,
    });
  });

  it("writes an empty string for no date, whatever the time says", () => {
    // What every call site's cleared filter already means.
    expect(buildDateValue(null, 14, 30, true)).toBe("");
    expect(buildDateValue(null, null, null, false)).toBe("");
  });

  it("writes midnight for a time-carrying field whose hour was never touched", () => {
    // Exactly what the native control did, so a campaign window saved without
    // touching the time keeps its old meaning.
    expect(buildDateValue("2026-09-12", null, null, true)).toBe("2026-09-12T00:00");
  });

  it("names the hour without a timezone to get wrong", () => {
    expect(formatClockLabel(0, 0)).toBe("12:00 am");
    expect(formatClockLabel(12, 0)).toBe("12:00 pm");
    expect(formatClockLabel(9, 5)).toBe("9:05 am");
    expect(formatClockLabel(23, 59)).toBe("11:59 pm");
  });
});
