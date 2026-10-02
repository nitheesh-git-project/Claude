import { describe, expect, it } from "vitest";
import { isPastDateKey, parseDateExceptionBody } from "./dateException";

describe("parseDateExceptionBody", () => {
  it("reads an all-day closure as every hour unavailable", () => {
    const parsed = parseDateExceptionBody({ date: "2026-10-12", mode: "unavailable" });
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.mode).toBe("unavailable");
    expect(parsed.rows.length).toBeGreaterThan(0);
    expect(parsed.rows.every((r) => !r.available)).toBe(true);
    expect(parsed.description).toBe("Unavailable all day");
  });

  it("opens exactly the hours asked for and closes the rest", () => {
    const parsed = parseDateExceptionBody({
      date: "2026-10-12",
      mode: "custom_hours",
      ranges: [{ startHour: 10, endHour: 12 }],
    });
    if ("error" in parsed) throw new Error(parsed.error);
    const open = parsed.rows.filter((r) => r.available).map((r) => r.hour);
    expect(open).toEqual([10, 11]);
    expect(parsed.rows.some((r) => !r.available)).toBe(true);
  });

  it("clears with no rows", () => {
    const parsed = parseDateExceptionBody({ date: "2026-10-12", mode: "clear" });
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.rows).toEqual([]);
  });

  it("refuses a bad date, an unknown mode, and custom hours with none", () => {
    expect("error" in parseDateExceptionBody({ date: "2026-02-30", mode: "clear" })).toBe(true);
    expect("error" in parseDateExceptionBody({ date: "2026-10-12", mode: "off" })).toBe(true);
    expect(
      "error" in parseDateExceptionBody({ date: "2026-10-12", mode: "custom_hours", ranges: [] })
    ).toBe(true);
  });

  it("keeps a note to 200 characters", () => {
    const parsed = parseDateExceptionBody({ date: "2026-10-12", mode: "clear", note: "x".repeat(500) });
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.note).toHaveLength(200);
  });
});

describe("isPastDateKey", () => {
  it("is past only strictly before today", () => {
    expect(isPastDateKey("2026-10-01", "2026-10-02")).toBe(true);
    expect(isPastDateKey("2026-10-02", "2026-10-02")).toBe(false);
    expect(isPastDateKey("2026-10-03", "2026-10-02")).toBe(false);
    expect(isPastDateKey("2025-12-31", "2026-01-01")).toBe(true);
  });
});
