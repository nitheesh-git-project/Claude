import { describe, expect, it } from "vitest";
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  cloneWeekly,
  describeDay,
  describeException,
  describeLeave,
  effectiveRangesForDate,
  emptyWeeklySchedule,
  exceptionRowsForRanges,
  findAppointmentsInRemovedHours,
  formatExceptionDate,
  formatRanges,
  formatShortDate,
  hoursToRanges,
  listExceptions,
  nextWorkingPeriod,
  normalizeRanges,
  rangesToHours,
  rosterStatusFor,
  shiftDateKey,
  summarizeWeek,
  summarizeWorkingWeek,
  templateToWeekly,
  validateRanges,
  weeklyEquals,
  weeklyToTemplate,
  zonedDayAndHour,
} from "@/lib/availabilityRanges";
import { AVAILABILITY_HOURS, computeDayAvailability } from "@/lib/therapistAvailability";

describe("hours <-> ranges", () => {
  it("collapses contiguous hours into one period", () => {
    expect(hoursToRanges([9, 10, 11, 12])).toEqual([{ startHour: 9, endHour: 13 }]);
  });

  it("keeps a lunch break as two periods", () => {
    expect(hoursToRanges([9, 10, 11, 12, 14, 15, 16, 17])).toEqual([
      { startHour: 9, endHour: 13 },
      { startHour: 14, endHour: 18 },
    ]);
  });

  it("round-trips any hour set unchanged -- the migration guarantee", () => {
    const cases = [[], [6], [23], [6, 7, 9, 23], AVAILABILITY_HOURS];
    for (const hours of cases) {
      expect(rangesToHours(hoursToRanges(hours))).toEqual([...hours].sort((a, b) => a - b));
    }
  });

  it("normalizes unsorted and touching periods", () => {
    expect(
      normalizeRanges([
        { startHour: 14, endHour: 18 },
        { startHour: 9, endHour: 12 },
        { startHour: 12, endHour: 14 },
      ])
    ).toEqual([{ startHour: 9, endHour: 18 }]);
  });
});

describe("validateRanges", () => {
  it("accepts an empty day and a normal split day", () => {
    expect(validateRanges([])).toBeNull();
    expect(
      validateRanges([
        { startHour: 9, endHour: 13 },
        { startHour: 14, endHour: 18 },
      ])
    ).toBeNull();
  });

  it("rejects a period that ends before it starts", () => {
    expect(validateRanges([{ startHour: 13, endHour: 9 }])).toMatch(/end after it starts/);
    expect(validateRanges([{ startHour: 9, endHour: 9 }])).toMatch(/end after it starts/);
  });

  it("rejects overlapping and duplicate periods", () => {
    expect(
      validateRanges([
        { startHour: 9, endHour: 13 },
        { startHour: 12, endHour: 15 },
      ])
    ).toMatch(/overlap/);
    expect(
      validateRanges([
        { startHour: 9, endHour: 13 },
        { startHour: 9, endHour: 13 },
      ])
    ).toMatch(/identical/);
  });

  it("rejects hours outside the declared business day", () => {
    expect(validateRanges([{ startHour: DAY_START_HOUR - 1, endHour: 9 }])).toMatch(/between/);
    expect(validateRanges([{ startHour: 22, endHour: DAY_END_HOUR + 1 }])).toMatch(/between/);
    expect(validateRanges([{ startHour: 22, endHour: DAY_END_HOUR }])).toBeNull();
  });

  it("rejects a non-whole hour", () => {
    expect(validateRanges([{ startHour: 9.5, endHour: 13 }])).toMatch(/whole hours/);
  });
});

describe("weekly schedule", () => {
  const rows = [
    { day_of_week: 1, hour: 9 },
    { day_of_week: 1, hour: 10 },
    { day_of_week: 1, hour: 14 },
    { day_of_week: 3, hour: 9 },
  ];

  it("reads stored template rows as periods", () => {
    const weekly = templateToWeekly(rows);
    expect(weekly[1]).toEqual([
      { startHour: 9, endHour: 11 },
      { startHour: 14, endHour: 15 },
    ]);
    expect(weekly[3]).toEqual([{ startHour: 9, endHour: 10 }]);
    expect(weekly[2]).toEqual([]);
  });

  it("writes periods back to exactly the same rows", () => {
    const back = weeklyToTemplate(templateToWeekly(rows));
    const key = (r: { day_of_week: number; hour: number }) => `${r.day_of_week}-${r.hour}`;
    expect(back.map(key).sort()).toEqual(rows.map(key).sort());
  });

  it("compares by hours, not by how the periods were split", () => {
    const a = emptyWeeklySchedule();
    a[1] = [{ startHour: 9, endHour: 13 }];
    const b = emptyWeeklySchedule();
    b[1] = [
      { startHour: 9, endHour: 11 },
      { startHour: 11, endHour: 13 },
    ];
    expect(weeklyEquals(a, b)).toBe(true);
    b[1] = [{ startHour: 9, endHour: 12 }];
    expect(weeklyEquals(a, b)).toBe(false);
  });

  it("clones without sharing period objects", () => {
    const a = emptyWeeklySchedule();
    a[1] = [{ startHour: 9, endHour: 13 }];
    const copy = cloneWeekly(a);
    copy[1][0].endHour = 18;
    expect(a[1][0].endHour).toBe(13);
  });
});

describe("summarizeWeek", () => {
  it("collapses consecutive identical days", () => {
    const weekly = emptyWeeklySchedule();
    for (const day of [1, 2, 3, 4, 5]) weekly[day] = [{ startHour: 9, endHour: 18 }];
    const lines = summarizeWorkingWeek(weekly);
    expect(lines).toEqual([{ days: "Mon–Fri", hours: "9 AM – 6 PM", working: true }]);
  });

  it("keeps an off day as its own line and reads Monday-first", () => {
    const weekly = emptyWeeklySchedule();
    weekly[1] = [{ startHour: 9, endHour: 13 }];
    weekly[2] = [{ startHour: 9, endHour: 13 }];
    weekly[4] = [{ startHour: 9, endHour: 13 }];
    const lines = summarizeWeek(weekly);
    expect(lines[0]).toEqual({ days: "Mon–Tue", hours: "9 AM – 1 PM", working: true });
    expect(lines[1]).toEqual({ days: "Wed", hours: "Off", working: false });
    expect(lines[2]).toEqual({ days: "Thu", hours: "9 AM – 1 PM", working: true });
    expect(lines[3]).toEqual({ days: "Fri–Sun", hours: "Off", working: false });
  });

  it("formats two periods with a separator and midnight as 12 AM", () => {
    expect(
      formatRanges([
        { startHour: 9, endHour: 13 },
        { startHour: 14, endHour: 18 },
      ])
    ).toBe("9 AM – 1 PM · 2 PM – 6 PM");
    expect(formatRanges([{ startHour: 23, endHour: 24 }])).toBe("11 PM – 12 AM");
    expect(formatRanges([])).toBe("Off");
  });
});

describe("describeDay", () => {
  it("says what a screen reader needs instead of naming a colour", () => {
    expect(
      describeDay(1, [
        { startHour: 9, endHour: 13 },
        { startHour: 14, endHour: 18 },
      ])
    ).toBe("Monday, working, 9 AM to 1 PM and 2 PM to 6 PM");
    expect(describeDay(3, [])).toBe("Wednesday, not working");
  });
});

describe("exceptions", () => {
  // 2026-09-07 is a Monday.
  const template = [
    { day_of_week: 1, hour: 9 },
    { day_of_week: 1, hour: 10 },
    { day_of_week: 1, hour: 11 },
  ];

  it("resolves a date to the weekly hours when nothing is set", () => {
    expect(effectiveRangesForDate("2026-09-07", template, [])).toEqual([
      { startHour: 9, endHour: 12 },
    ]);
  });

  it("pins a date to custom hours", () => {
    const rows = exceptionRowsForRanges([{ startHour: 10, endHour: 14 }]).map((r) => ({
      ...r,
      date: "2026-09-07",
    }));
    expect(effectiveRangesForDate("2026-09-07", template, rows)).toEqual([
      { startHour: 10, endHour: 14 },
    ]);
    // The weekly schedule itself is untouched: another Monday still reads 9-12.
    expect(effectiveRangesForDate("2026-09-14", template, rows)).toEqual([
      { startHour: 9, endHour: 12 },
    ]);
  });

  it("marks a whole date unavailable with an empty period list", () => {
    const rows = exceptionRowsForRanges([]).map((r) => ({ ...r, date: "2026-09-07" }));
    expect(effectiveRangesForDate("2026-09-07", template, rows)).toEqual([]);
    expect(rows.every((r) => r.available === false)).toBe(true);
  });

  it("agrees with computeDayAvailability, which the booking side reads", () => {
    const rows = exceptionRowsForRanges([{ startHour: 10, endHour: 12 }]).map((r) => ({
      ...r,
      date: "2026-09-07",
    }));
    const day = computeDayAvailability("2026-09-07", template, rows);
    const openHours = AVAILABILITY_HOURS.filter(
      (h) => day[h] === "available" || day[h] === "override_available"
    );
    expect(openHours).toEqual(rangesToHours(effectiveRangesForDate("2026-09-07", template, rows)));
  });

  it("reads a sparse pre-redesign row correctly", () => {
    // One hour flipped off, the way the old per-cell grid wrote it.
    const rows = [{ date: "2026-09-07", hour: 10, available: false }];
    const [exception] = listExceptions(template, rows);
    expect(exception.dateKey).toBe("2026-09-07");
    expect(exception.kind).toBe("custom_hours");
    expect(describeException(exception)).toBe("Available 9 AM – 10 AM · 11 AM – 12 PM");
  });

  it("lists exceptions ascending and drops past dates when asked", () => {
    const rows = [
      { date: "2026-09-21", hour: 9, available: false },
      { date: "2026-09-07", hour: 9, available: false },
      { date: "2026-08-01", hour: 9, available: false },
    ];
    expect(listExceptions(template, rows).map((e) => e.dateKey)).toEqual([
      "2026-08-01",
      "2026-09-07",
      "2026-09-21",
    ]);
    expect(
      listExceptions(template, rows, { fromDateKey: "2026-09-07" }).map((e) => e.dateKey)
    ).toEqual(["2026-09-07", "2026-09-21"]);
  });
});

describe("nextWorkingPeriod", () => {
  const template = [
    { day_of_week: 2, hour: 9 },
    { day_of_week: 2, hour: 10 },
  ];

  it("finds the next date with hours", () => {
    // 2026-09-07 Monday -> next Tuesday is 2026-09-08.
    expect(nextWorkingPeriod("2026-09-07", template, [])).toEqual({
      dateKey: "2026-09-08",
      range: { startHour: 9, endHour: 11 },
    });
  });

  it("skips a date an exception closed", () => {
    const rows = exceptionRowsForRanges([]).map((r) => ({ ...r, date: "2026-09-08" }));
    expect(nextWorkingPeriod("2026-09-07", template, rows)?.dateKey).toBe("2026-09-15");
  });

  it("returns nothing while on leave, and for an empty schedule", () => {
    expect(nextWorkingPeriod("2026-09-07", template, [], { onLeave: true })).toBeNull();
    expect(nextWorkingPeriod("2026-09-07", [], [])).toBeNull();
  });
});

describe("rosterStatusFor", () => {
  const weekly = emptyWeeklySchedule();
  weekly[1] = [{ startHour: 9, endHour: 13 }];

  it("puts leave ahead of everything else, without clearing the schedule", () => {
    expect(rosterStatusFor({ onLeave: true, weekly, todayRanges: weekly[1] })).toBe("on_leave");
  });

  it("distinguishes an off day from no schedule at all", () => {
    expect(rosterStatusFor({ onLeave: false, weekly, todayRanges: [] })).toBe("off_today");
    expect(
      rosterStatusFor({ onLeave: false, weekly: emptyWeeklySchedule(), todayRanges: [] })
    ).toBe("no_schedule");
    expect(rosterStatusFor({ onLeave: false, weekly, todayRanges: weekly[1] })).toBe(
      "available_today"
    );
  });
});

describe("zonedDayAndHour", () => {
  it("reads an instant in the therapist's own zone, not the reader's", () => {
    // 2026-09-07T20:30Z is 2 AM on the 8th in Kolkata, still the 7th in New York.
    expect(zonedDayAndHour("2026-09-07T20:30:00Z", "Asia/Kolkata")).toEqual({
      dayOfWeek: 2,
      hour: 2,
      dateKey: "2026-09-08",
    });
    expect(zonedDayAndHour("2026-09-07T20:30:00Z", "America/New_York")).toEqual({
      dayOfWeek: 1,
      hour: 16,
      dateKey: "2026-09-07",
    });
  });

  it("returns null rather than guessing on bad input", () => {
    expect(zonedDayAndHour("not-a-date", "Asia/Kolkata")).toBeNull();
    expect(zonedDayAndHour("2026-09-07T20:30:00Z", "Not/AZone")).toBeNull();
  });
});

describe("findAppointmentsInRemovedHours", () => {
  const previous = emptyWeeklySchedule();
  previous[1] = [{ startHour: 9, endHour: 18 }];
  const next = emptyWeeklySchedule();
  next[1] = [{ startHour: 14, endHour: 18 }];
  // Monday 2026-09-07, 10:00 and 11:00 IST.
  const appointments = [
    { id: "a", slotTime: "2026-09-07T04:30:00Z", status: "confirmed", label: "Patient A" },
    { id: "b", slotTime: "2026-09-07T05:30:00Z", status: "confirmed", label: "Patient B" },
    { id: "c", slotTime: "2026-09-07T09:30:00Z", status: "confirmed", label: "Patient C" },
  ];
  const nowMs = Date.parse("2026-09-01T00:00:00Z");

  it("names the future appointments inside the hours being removed", () => {
    const affected = findAppointmentsInRemovedHours(appointments, previous, next, {
      timeZone: "Asia/Kolkata",
      nowMs,
    });
    expect(affected.map((a) => a.label)).toEqual(["Patient A", "Patient B"]);
    expect(affected[0].hour).toBe(10);
  });

  it("ignores cancelled and already-past sessions", () => {
    const affected = findAppointmentsInRemovedHours(
      [
        { ...appointments[0], status: "cancelled" },
        { ...appointments[1], id: "past", slotTime: "2025-09-08T04:30:00Z" },
      ],
      previous,
      next,
      { timeZone: "Asia/Kolkata", nowMs }
    );
    expect(affected).toEqual([]);
  });

  it("finds nothing when hours are only being added", () => {
    const widened = emptyWeeklySchedule();
    widened[1] = [{ startHour: 8, endHour: 20 }];
    expect(
      findAppointmentsInRemovedHours(appointments, previous, widened, {
        timeZone: "Asia/Kolkata",
        nowMs,
      })
    ).toEqual([]);
  });
});

describe("date helpers", () => {
  it("spells dates the same way in every runtime", () => {
    expect(formatExceptionDate("2026-09-08")).toBe("Tuesday 8 September");
    expect(formatShortDate("2026-09-08")).toBe("8 Sep");
    expect(formatShortDate("2026-12-01")).toBe("1 Dec");
    // A date key is timezone-free, so the label must not move with one.
    const original = process.env.TZ;
    process.env.TZ = "Pacific/Kiritimati";
    expect(formatExceptionDate("2026-09-08")).toBe("Tuesday 8 September");
    process.env.TZ = original;
  });

  it("shifts a date key across a month boundary without a local clock", () => {
    expect(shiftDateKey("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftDateKey("2026-09-01", -1)).toBe("2026-08-31");
  });

  it("describes leave with dates and a reason", () => {
    expect(
      describeLeave({ onLeave: true, from: "2026-09-10", to: "2026-09-17", reason: "Annual leave" })
      // Exact, not a tolerant pattern. These strings are server-rendered and
      // hydrated in a browser, so "whatever this runtime's ICU says" is the
      // bug, not an acceptable variation -- a tolerant assertion here is
      // what let a real hydration mismatch through the first time.
    ).toBe("10 Sep – 17 Sep · Annual leave");
    expect(describeLeave({ onLeave: true, from: null, to: null, reason: null })).toBe(
      "No end date set"
    );
    expect(describeLeave({ onLeave: false, from: null, to: null, reason: null })).toBeNull();
  });
});
