import { describe, expect, it } from "vitest";
import {
  parseDateKey,
  parseExceptionRangesBody,
  parseExpectedVersion,
  parseWeeklyScheduleBody,
} from "@/lib/availabilityRequest";
import { parseLeaveDates } from "@/lib/leaveRequest";

// The client validates too, so a person sees a problem before they submit.
// These are the checks that actually decide -- both save routes go through
// them, which is what stops the admin door growing weaker rules than the
// therapist's own.

const ok = (body: unknown) => {
  const result = parseWeeklyScheduleBody(body);
  if ("error" in result) throw new Error(`expected acceptance, got: ${result.error}`);
  return result.slots;
};
const rejected = (body: unknown) => {
  const result = parseWeeklyScheduleBody(body);
  return "error" in result ? result.error : null;
};

describe("parseWeeklyScheduleBody", () => {
  it("expands periods into the hour rows the table stores", () => {
    expect(
      ok([
        {
          day_of_week: 1,
          ranges: [
            { startHour: 9, endHour: 12 },
            { startHour: 14, endHour: 16 },
          ],
        },
        { day_of_week: 3, ranges: [] },
      ])
    ).toEqual([
      { day_of_week: 1, hour: 9 },
      { day_of_week: 1, hour: 10 },
      { day_of_week: 1, hour: 11 },
      { day_of_week: 1, hour: 14 },
      { day_of_week: 1, hour: 15 },
    ]);
  });

  it("accepts an empty week -- a therapist with no hours is a real state", () => {
    expect(ok([])).toEqual([]);
  });

  it("refuses anything that is not a list of days", () => {
    expect(rejected(undefined)).toMatch(/days array/);
    expect(rejected("monday")).toMatch(/days array/);
    expect(rejected([1, 2])).toMatch(/Malformed day/);
    expect(rejected(Array.from({ length: 8 }, () => ({ day_of_week: 1, ranges: [] })))).toMatch(
      /seven days/
    );
  });

  it("refuses an invalid or repeated day", () => {
    expect(rejected([{ day_of_week: 7, ranges: [] }])).toMatch(/Invalid day/);
    expect(rejected([{ day_of_week: -1, ranges: [] }])).toMatch(/Invalid day/);
    expect(rejected([{ day_of_week: 1.5, ranges: [] }])).toMatch(/Invalid day/);
    expect(
      rejected([
        { day_of_week: 1, ranges: [] },
        { day_of_week: 1, ranges: [] },
      ])
    ).toMatch(/twice/);
  });

  it("refuses invalid periods -- the same rules the editor shows", () => {
    const day = (ranges: unknown) => [{ day_of_week: 1, ranges }];
    expect(rejected(day("9-5"))).toMatch(/Malformed working periods/);
    expect(rejected(day([{ startHour: 9 }]))).toMatch(/Malformed working period/);
    expect(rejected(day([{ startHour: "9", endHour: "17" }]))).toMatch(/Malformed working period/);
    expect(rejected(day([{ startHour: 9.5, endHour: 12 }]))).toMatch(/whole hours/);
    expect(rejected(day([{ startHour: 13, endHour: 9 }]))).toMatch(/end after it starts/);
    expect(rejected(day([{ startHour: 3, endHour: 5 }]))).toMatch(/outside the bookable day/);
    expect(rejected(day([{ startHour: 22, endHour: 25 }]))).toMatch(/outside the bookable day/);
    expect(
      rejected(
        day([
          { startHour: 9, endHour: 13 },
          { startHour: 12, endHour: 15 },
        ])
      )
    ).toMatch(/overlap/);
    expect(
      rejected(
        day([
          { startHour: 9, endHour: 13 },
          { startHour: 9, endHour: 13 },
        ])
      )
    ).toMatch(/identical/);
    expect(
      rejected(day(Array.from({ length: 19 }, () => ({ startHour: 9, endHour: 10 }))))
    ).toMatch(/Too many/);
  });

  it("allows the full declared day, boundaries included", () => {
    expect(ok([{ day_of_week: 0, ranges: [{ startHour: 6, endHour: 24 }] }]).length).toBe(18);
  });
});

describe("parseDateKey", () => {
  it("takes a real calendar date and nothing else", () => {
    expect(parseDateKey("2026-09-12")).toEqual({ dateKey: "2026-09-12" });
    expect(parseDateKey("2026-2-3")).toEqual({ error: "Invalid date." });
    expect(parseDateKey("12-09-2026")).toEqual({ error: "Invalid date." });
    expect(parseDateKey("2026-02-31")).toEqual({ error: "Invalid date." });
    expect(parseDateKey(20260912)).toEqual({ error: "Invalid date." });
    expect(parseDateKey(null)).toEqual({ error: "Invalid date." });
  });

  it("allows a past date -- correcting last week's roster is legitimate", () => {
    expect(parseDateKey("2020-01-01")).toEqual({ dateKey: "2020-01-01" });
  });
});

describe("parseExceptionRangesBody", () => {
  it("treats nothing as an empty day and validates the rest", () => {
    expect(parseExceptionRangesBody(undefined)).toEqual({ ranges: [] });
    expect(parseExceptionRangesBody([{ startHour: 10, endHour: 14 }])).toEqual({
      ranges: [{ startHour: 10, endHour: 14 }],
    });
    expect(parseExceptionRangesBody("all day")).toEqual({ error: "Malformed working periods." });
    expect(
      parseExceptionRangesBody([
        { startHour: 10, endHour: 14 },
        { startHour: 13, endHour: 16 },
      ])
    ).toEqual({ error: "Two periods on the same day overlap." });
  });
});

describe("parseExpectedVersion", () => {
  it("accepts a version or none, and refuses nonsense", () => {
    expect(parseExpectedVersion(undefined)).toEqual({ version: null });
    expect(parseExpectedVersion(3)).toEqual({ version: 3 });
    expect(parseExpectedVersion(-1)).toEqual({ error: "Invalid schedule version." });
    expect(parseExpectedVersion("3")).toEqual({ error: "Invalid schedule version." });
    expect(parseExpectedVersion(1.5)).toEqual({ error: "Invalid schedule version." });
  });
});

describe("parseLeaveDates", () => {
  it("accepts leave with no dates at all", () => {
    expect(parseLeaveDates({ onLeave: true })).toEqual({ from: null, to: null, reason: null });
  });

  it("keeps dates and a trimmed reason", () => {
    expect(
      parseLeaveDates({
        onLeave: true,
        from: "2026-09-10",
        to: "2026-09-17",
        reason: "  Annual leave  ",
      })
    ).toEqual({ from: "2026-09-10", to: "2026-09-17", reason: "Annual leave" });
  });

  it("refuses leave that ends before it starts, and a malformed date", () => {
    expect(parseLeaveDates({ onLeave: true, from: "2026-09-17", to: "2026-09-10" })).toEqual({
      error: "Leave can't end before it starts.",
    });
    expect(parseLeaveDates({ onLeave: true, from: "17-09-2026" })).toEqual({
      error: "Invalid leave date.",
    });
  });

  it("clears the whole annotation when leave ends", () => {
    expect(
      parseLeaveDates({ onLeave: false, from: "2026-09-10", to: "2026-09-17", reason: "x" })
    ).toEqual({ from: null, to: null, reason: null });
  });
});

describe("leave annotation is only rewritten when somebody mentioned it", () => {
  // The route decides this (see set-therapist-on-leave), and the rule is
  // worth stating once: the compact toggle on a therapist's admin page
  // flips the flag and knows nothing about the reason typed on the roster.
  const mentionsDates = (body: Record<string, unknown>) =>
    "from" in body || "to" in body || "reason" in body;

  it("a flag-only request touches no dates", () => {
    expect(mentionsDates({ therapistId: "x", onLeave: true })).toBe(false);
  });

  it("a request carrying any of the three does", () => {
    expect(mentionsDates({ onLeave: true, reason: "Annual leave" })).toBe(true);
    expect(mentionsDates({ onLeave: true, from: null })).toBe(true);
  });
});
