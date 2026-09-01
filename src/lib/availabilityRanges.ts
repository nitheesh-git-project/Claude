// The range layer over the roster's hour-slot storage.
//
// The booking engine, the admin roster and the therapist's own screen have
// always stored availability as one row per enabled hour-of-week
// (therapist_availability_template) plus one row per exception hour on a
// date (therapist_availability_override). That representation is correct and
// nothing here changes it -- what it is not is something a person can read
// or edit. Every function below converts between the stored hours and the
// working periods a human actually thinks in ("Monday 9 AM - 1 PM and
// 2 PM - 6 PM"), so the UI can talk in ranges while the database keeps
// thinking in slots.
//
// Dependency-free on purpose, same convention as therapistAvailability.ts
// and bookingSlots.ts: this is where the roster's maths is unit-tested
// without rendering anything.

import {
  AVAILABILITY_HOURS,
  DAY_LABELS,
  DAY_LABELS_SHORT,
  DAY_ORDER,
  computeDayAvailability,
  formatHourLabel,
  type OverrideRow,
  type TemplateRow,
} from "@/lib/therapistAvailability";

// The declared business day: 6 AM through midnight, i.e. the 18 one-hour
// slots AVAILABILITY_HOURS covers. A range's end is exclusive, so the last
// possible period ends at 24 (rendered "12 AM").
export const DAY_START_HOUR = AVAILABILITY_HOURS[0];
export const DAY_END_HOUR = AVAILABILITY_HOURS[AVAILABILITY_HOURS.length - 1] + 1;

/** A working period. `endHour` is exclusive: 9-13 means 9 AM until 1 PM. */
export type TimeRange = { startHour: number; endHour: number };

/** Working periods per JS day-of-week (0=Sunday..6=Saturday). */
export type WeeklySchedule = Record<number, TimeRange[]>;

/** Every hour a range covers, ascending. */
export function rangeHours(range: TimeRange): number[] {
  const hours: number[] = [];
  for (let h = range.startHour; h < range.endHour; h++) hours.push(h);
  return hours;
}

export function rangesToHours(ranges: TimeRange[]): number[] {
  const set = new Set<number>();
  for (const r of ranges) for (const h of rangeHours(r)) set.add(h);
  return [...set].sort((a, b) => a - b);
}

/**
 * Contiguous hours collapse into one period. This is the direction that
 * makes an existing therapist's schedule readable without migrating a
 * single row: whatever hours they toggled on in the old grid come back as
 * the periods those hours describe.
 */
export function hoursToRanges(hours: number[]): TimeRange[] {
  const sorted = [...new Set(hours)].sort((a, b) => a - b);
  const ranges: TimeRange[] = [];
  for (const hour of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && last.endHour === hour) last.endHour = hour + 1;
    else ranges.push({ startHour: hour, endHour: hour + 1 });
  }
  return ranges;
}

/** Sort + merge touching/overlapping periods. Display and storage only -- the
 *  editor validates before this ever runs, so a user never has an overlap
 *  silently repaired underneath them. */
export function normalizeRanges(ranges: TimeRange[]): TimeRange[] {
  return hoursToRanges(rangesToHours(ranges));
}

/**
 * Why this set of periods cannot be saved, or null when it can. Returned as
 * a sentence rather than a code because both the editor and the API route
 * show it to a person verbatim.
 */
export function validateRanges(ranges: TimeRange[]): string | null {
  if (ranges.length === 0) return null;
  for (const r of ranges) {
    if (!Number.isInteger(r.startHour) || !Number.isInteger(r.endHour)) {
      return "Working hours must be whole hours.";
    }
    if (r.startHour < DAY_START_HOUR || r.endHour > DAY_END_HOUR) {
      return `Working hours must fall between ${formatTimeLabel(DAY_START_HOUR)} and ${formatTimeLabel(DAY_END_HOUR)}.`;
    }
    if (r.startHour >= r.endHour) {
      return "A period has to end after it starts.";
    }
  }
  const sorted = [...ranges].sort((a, b) => a.startHour - b.startHour);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.startHour === prev.startHour && cur.endHour === prev.endHour) {
      return "Two periods on the same day are identical.";
    }
    if (cur.startHour < prev.endHour) {
      return "Two periods on the same day overlap.";
    }
  }
  return null;
}

/** "9 AM", "1 PM", "12 AM" for the exclusive end of the last slot. */
export function formatTimeLabel(hour: number): string {
  return formatHourLabel(hour);
}

export function formatRange(range: TimeRange): string {
  return `${formatTimeLabel(range.startHour)} – ${formatTimeLabel(range.endHour)}`;
}

/** "9 AM – 1 PM · 2 PM – 6 PM", or "Off" when there is nothing. */
export function formatRanges(ranges: TimeRange[], emptyLabel = "Off"): string {
  if (ranges.length === 0) return emptyLabel;
  return normalizeRanges(ranges).map(formatRange).join(" · ");
}

/**
 * What a screen reader should hear for one day. The old grid announced
 * eighteen buttons whose only difference was their colour; this is the
 * sentence that replaces them.
 */
export function describeDay(dayOfWeek: number, ranges: TimeRange[]): string {
  const day = DAY_LABELS[dayOfWeek] ?? "Day";
  if (ranges.length === 0) return `${day}, not working`;
  const spoken = normalizeRanges(ranges)
    .map((r) => `${formatTimeLabel(r.startHour)} to ${formatTimeLabel(r.endHour)}`)
    .join(" and ");
  return `${day}, working, ${spoken}`;
}

export function emptyWeeklySchedule(): WeeklySchedule {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

export function templateToWeekly(rows: TemplateRow[]): WeeklySchedule {
  const byDay = new Map<number, number[]>();
  for (const row of rows) {
    const list = byDay.get(row.day_of_week) ?? [];
    list.push(row.hour);
    byDay.set(row.day_of_week, list);
  }
  const weekly = emptyWeeklySchedule();
  for (const day of DAY_ORDER) weekly[day] = hoursToRanges(byDay.get(day) ?? []);
  return weekly;
}

export function weeklyToTemplate(weekly: WeeklySchedule): TemplateRow[] {
  const rows: TemplateRow[] = [];
  for (const day of DAY_ORDER) {
    for (const hour of rangesToHours(weekly[day] ?? [])) {
      rows.push({ day_of_week: day, hour });
    }
  }
  return rows;
}

export function weeklyEquals(a: WeeklySchedule, b: WeeklySchedule): boolean {
  for (const day of DAY_ORDER) {
    const left = rangesToHours(a[day] ?? []);
    const right = rangesToHours(b[day] ?? []);
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return false;
  }
  return true;
}

export function cloneWeekly(weekly: WeeklySchedule): WeeklySchedule {
  const next = emptyWeeklySchedule();
  for (const day of DAY_ORDER) next[day] = (weekly[day] ?? []).map((r) => ({ ...r }));
  return next;
}

export function totalWeeklyHours(weekly: WeeklySchedule): number {
  return DAY_ORDER.reduce((sum, day) => sum + rangesToHours(weekly[day] ?? []).length, 0);
}

export type WeekSummaryLine = { days: string; hours: string; working: boolean };

/**
 * The roster list's one-glance summary: consecutive days with identical
 * hours collapse into a single line ("Mon–Fri · 9 AM – 6 PM"), so eight
 * therapists fit on a screen instead of eight eighteen-column grids.
 * Grouping walks DAY_ORDER (Monday-first), matching how the week reads.
 */
export function summarizeWeek(weekly: WeeklySchedule): WeekSummaryLine[] {
  const lines: WeekSummaryLine[] = [];
  let group: { start: number; end: number; key: string; ranges: TimeRange[] } | null = null;

  const flush = () => {
    if (!group) return;
    const startLabel = DAY_LABELS_SHORT[DAY_ORDER[group.start]];
    const endLabel = DAY_LABELS_SHORT[DAY_ORDER[group.end]];
    lines.push({
      days: group.start === group.end ? startLabel : `${startLabel}–${endLabel}`,
      hours: formatRanges(group.ranges),
      working: group.ranges.length > 0,
    });
    group = null;
  };

  DAY_ORDER.forEach((day, index) => {
    const ranges = normalizeRanges(weekly[day] ?? []);
    const key = rangesToHours(ranges).join(",");
    if (group && group.key === key) {
      group.end = index;
      return;
    }
    flush();
    group = { start: index, end: index, key, ranges };
  });
  flush();
  return lines;
}

/** The same summary with the off days dropped -- for the places that only
 *  have room for what somebody actually works. */
export function summarizeWorkingWeek(weekly: WeeklySchedule): WeekSummaryLine[] {
  return summarizeWeek(weekly).filter((line) => line.working);
}

// -- Dates, exceptions and effective availability ------------------------

/**
 * The hours actually available on one date: the weekly template with that
 * date's exceptions applied on top. Delegates the precedence rule to
 * computeDayAvailability rather than restating it, so the roster, the
 * therapist's screen and anything reading effective availability can never
 * disagree about what a date resolves to.
 */
export function effectiveRangesForDate(
  dateKey: string,
  templateRows: TemplateRow[],
  overrideRows: OverrideRow[]
): TimeRange[] {
  const day = computeDayAvailability(dateKey, templateRows, overrideRows);
  const hours = AVAILABILITY_HOURS.filter(
    (hour) => day[hour] === "available" || day[hour] === "override_available"
  );
  return hoursToRanges(hours);
}

export type ExceptionKind = "unavailable_all_day" | "custom_hours";

export type ScheduleException = {
  dateKey: string;
  kind: ExceptionKind;
  /** What the therapist is available for on that date, after the exception. */
  ranges: TimeRange[];
  note: string | null;
};

/**
 * The dates a therapist has an exception on, as a list a person can read,
 * newest date first excluded -- ascending, because an exceptions list is
 * read forwards. Rows written before this redesign are sparse (one hour
 * flipped, not the whole day) and resolve correctly here for free, since
 * the effective hours are recomputed from template + exceptions rather than
 * read off the exception rows alone.
 */
export function listExceptions(
  templateRows: TemplateRow[],
  overrideRows: OverrideRow[],
  options: { fromDateKey?: string } = {}
): ScheduleException[] {
  const from = options.fromDateKey;
  const byDate = new Map<string, OverrideRow[]>();
  for (const row of overrideRows) {
    if (from && row.date < from) continue;
    const list = byDate.get(row.date) ?? [];
    list.push(row);
    byDate.set(row.date, list);
  }
  const noteByDate = new Map<string, string | null>();
  for (const row of overrideRows as (OverrideRow & { note?: string | null })[]) {
    if (!noteByDate.get(row.date) && row.note) noteByDate.set(row.date, row.note);
  }

  return [...byDate.keys()]
    .sort()
    .map((dateKey) => {
      const ranges = effectiveRangesForDate(dateKey, templateRows, byDate.get(dateKey) ?? []);
      return {
        dateKey,
        kind: ranges.length === 0 ? ("unavailable_all_day" as const) : ("custom_hours" as const),
        ranges,
        note: noteByDate.get(dateKey) ?? null,
      };
    });
}

/** "Unavailable all day" / "Available 10 AM – 2 PM" -- the exception list's
 *  one line, and the string a screen reader gets. */
export function describeException(exception: ScheduleException): string {
  if (exception.kind === "unavailable_all_day") return "Unavailable all day";
  return `Available ${formatRanges(exception.ranges)}`;
}

/**
 * The rows that pin one date to exactly `ranges`. Every hour of the
 * business day is written, not just the ones that differ: a date exception
 * means "this is the day", so a later edit to the weekly schedule must not
 * leak through a date somebody has already answered for.
 */
export function exceptionRowsForRanges(ranges: TimeRange[]): { hour: number; available: boolean }[] {
  const open = new Set(rangesToHours(ranges));
  return AVAILABILITY_HOURS.map((hour) => ({ hour, available: open.has(hour) }));
}

// -- Timezone-aware reading of an appointment ----------------------------

/**
 * A therapist's declared hours are in their own local time (see schema.sql
 * on therapist_availability_template), while an appointment's slot_time is
 * an absolute instant. Comparing the two means reading the instant in the
 * therapist's zone -- never the admin's browser, which is the bug this
 * whole helper exists to avoid.
 */
export function zonedDayAndHour(
  iso: string,
  timeZone: string
): { dayOfWeek: number; hour: number; dateKey: string } | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(at);
  } catch {
    return null;
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayIndex: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayOfWeek = weekdayIndex[get("weekday")];
  // "24" is a legal hour-cycle answer for midnight in some environments.
  const hour = Number(get("hour")) % 24;
  if (dayOfWeek === undefined || Number.isNaN(hour)) return null;
  return { dayOfWeek, hour, dateKey: `${get("year")}-${get("month")}-${get("day")}` };
}

export type ScheduledAppointment = {
  id: string;
  slotTime: string | null;
  status: string | null;
  label: string;
};

export type AffectedAppointment = {
  id: string;
  label: string;
  dayOfWeek: number;
  hour: number;
  dateKey: string;
};

/**
 * Future, non-cancelled appointments that sit inside hours this edit is
 * taking away. Availability and appointments are separate systems -- saving
 * a schedule never touches a booking -- so this exists to tell the person
 * editing what they are about to stop matching, not to change anything.
 * Nothing here cancels, moves or flags an appointment.
 */
export function findAppointmentsInRemovedHours(
  appointments: ScheduledAppointment[],
  previous: WeeklySchedule,
  next: WeeklySchedule,
  options: { timeZone: string; nowMs: number }
): AffectedAppointment[] {
  const removed = new Set<string>();
  for (const day of DAY_ORDER) {
    const before = new Set(rangesToHours(previous[day] ?? []));
    const after = new Set(rangesToHours(next[day] ?? []));
    for (const hour of before) if (!after.has(hour)) removed.add(`${day}-${hour}`);
  }
  if (removed.size === 0) return [];

  const affected: AffectedAppointment[] = [];
  for (const appointment of appointments) {
    if (!appointment.slotTime) continue;
    if (appointment.status === "cancelled") continue;
    const at = new Date(appointment.slotTime).getTime();
    if (Number.isNaN(at) || at < options.nowMs) continue;
    const zoned = zonedDayAndHour(appointment.slotTime, options.timeZone);
    if (!zoned) continue;
    if (!removed.has(`${zoned.dayOfWeek}-${zoned.hour}`)) continue;
    affected.push({
      id: appointment.id,
      label: appointment.label,
      dayOfWeek: zoned.dayOfWeek,
      hour: zoned.hour,
      dateKey: zoned.dateKey,
    });
  }
  return affected.sort((a, b) =>
    a.dateKey === b.dateKey ? a.hour - b.hour : a.dateKey.localeCompare(b.dateKey)
  );
}

// -- Roster status -------------------------------------------------------

export type RosterStatus = "on_leave" | "available_today" | "off_today" | "no_schedule";

export const ROSTER_STATUS_LABELS: Record<RosterStatus, string> = {
  on_leave: "On leave",
  available_today: "Available today",
  off_today: "Not working today",
  no_schedule: "No schedule set",
};

/**
 * How one therapist reads on the roster list today. `todayKey` is passed in
 * rather than computed: the admin dashboard renders on the server and
 * hydrates in a browser, and a "today" derived from whichever clock happens
 * to be running is the hydration-mismatch bug this codebase has already
 * fixed twice.
 */
export function rosterStatusFor(input: {
  onLeave: boolean;
  weekly: WeeklySchedule;
  todayRanges: TimeRange[];
}): RosterStatus {
  if (input.onLeave) return "on_leave";
  if (totalWeeklyHours(input.weekly) === 0) return "no_schedule";
  return input.todayRanges.length > 0 ? "available_today" : "off_today";
}

/** Add days to a YYYY-MM-DD key without touching a local clock. */
export function shiftDateKey(dateKey: string, days: number): string {
  const at = new Date(`${dateKey}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

export type NextWorkingPeriod = { dateKey: string; range: TimeRange } | null;

/**
 * The next date the therapist has hours on, scanning forward from
 * `fromDateKey`. Exceptions are honoured, so a therapist whose Monday is
 * cancelled reads as next available on Tuesday rather than in an hour that
 * is not there. Bounded at 60 days: past that "no upcoming hours" is the
 * honest answer and the roster says so.
 */
export function nextWorkingPeriod(
  fromDateKey: string,
  templateRows: TemplateRow[],
  overrideRows: OverrideRow[],
  options: { onLeave?: boolean; horizonDays?: number } = {}
): NextWorkingPeriod {
  if (options.onLeave) return null;
  const horizon = options.horizonDays ?? 60;
  for (let i = 0; i < horizon; i++) {
    const dateKey = shiftDateKey(fromDateKey, i);
    const ranges = effectiveRangesForDate(dateKey, templateRows, overrideRows);
    if (ranges.length > 0) return { dateKey, range: ranges[0] };
  }
  return null;
}

// Written out rather than asked of Intl, deliberately.
//
// These labels render on the server and hydrate in a browser, and the two
// runtimes do not ship the same locale data: `toLocaleDateString("en-IN")`
// gives "Tuesday 8 September" under Node's ICU and "Tuesday, 8 September"
// in Chromium, and "Sep" in one where the other says "Sept". Pinning the
// timeZone -- which the first version of this did -- fixes the date but not
// the wording, so every exception row hydration-mismatched. A calendar date
// has no timezone to convert anyway (the same reasoning schema.sql gives
// for storing it as `date`), so it is read in UTC and spelled here.
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "Tuesday 8 September" -- the exceptions list's own line. */
export function formatExceptionDate(dateKey: string): string {
  const at = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return dateKey;
  return `${WEEKDAY_NAMES[at.getUTCDay()]} ${at.getUTCDate()} ${MONTH_NAMES[at.getUTCMonth()]}`;
}

/** "8 Sep" -- for the roster list, where the whole line has to fit. */
export function formatShortDate(dateKey: string): string {
  const at = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return dateKey;
  return `${at.getUTCDate()} ${MONTH_NAMES[at.getUTCMonth()].slice(0, 3)}`;
}

/** The one-line leave summary: dates when they were given, the reason when
 *  there is one. */
export function describeLeave(input: {
  onLeave: boolean;
  from: string | null;
  to: string | null;
  reason: string | null;
}): string | null {
  if (!input.onLeave) return null;
  const dates =
    input.from && input.to
      ? `${formatShortDate(input.from)} – ${formatShortDate(input.to)}`
      : input.from
        ? `from ${formatShortDate(input.from)}`
        : input.to
          ? `until ${formatShortDate(input.to)}`
          : null;
  const reason = input.reason?.trim() || null;
  if (dates && reason) return `${dates} · ${reason}`;
  return dates ?? reason ?? "No end date set";
}

/** Presets the editor offers. UI convenience only -- any valid set of
 *  periods can still be typed, these just cover the common shapes. */
export const SCHEDULE_PRESETS: { key: string; label: string; ranges: TimeRange[] }[] = [
  { key: "morning", label: "Morning", ranges: [{ startHour: 9, endHour: 13 }] },
  { key: "afternoon", label: "Afternoon", ranges: [{ startHour: 14, endHour: 18 }] },
  {
    key: "full_day",
    label: "Full day",
    ranges: [
      { startHour: 9, endHour: 13 },
      { startHour: 14, endHour: 18 },
    ],
  },
];
