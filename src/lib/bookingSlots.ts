// Pure date/slot helpers for the /book wizard's Step 1 picker. Kept
// dependency-free (same convention as therapistAvailability.ts) so the
// lead-time and calendar math is unit-testable without rendering.
//
// Every timestamp here is built the same way Step 1 has always built it --
// `new Date("YYYY-MM-DDTHH:00")`, i.e. parsed in the *browser's* local
// timezone, which is the timezone Step 1 shows the patient. This file
// deliberately does not re-implement or "fix" that: the booking validation
// in BookingWizard.goToStep2 compares against the same value, so the picker
// and the validator can never disagree about whether a slot is far enough
// out.

import { AVAILABILITY_HOURS, DAY_ORDER, DAY_LABELS_SHORT } from "@/lib/therapistAvailability";

// Minimum lead time between "now" and the start of a bookable slot. Was
// previously an inline `12 * 60 * 60 * 1000` in two separate places in
// BookingWizard (the validator and the time dropdown's filter); pulled out
// here so the picker and the validator can't drift apart.
export const BOOKING_LEAD_TIME_HOURS = 12;
export const BOOKING_LEAD_TIME_MS = BOOKING_LEAD_TIME_HOURS * 60 * 60 * 1000;

// Home visits need a longer runway than an online session -- a therapist has
// to physically reach the address, not just be free -- so every function
// below takes an optional lead time and defaults to the online one.
//
// Deliberately a parameter rather than a second copy of this module. The
// whole reason these helpers exist is that the picker and the validator were
// once separate inline expressions that drifted; forking the file for a
// second lead time would recreate exactly that bug one level up. Callers
// pass site_settings.home_visit_lead_time_hours through
// leadTimeMsFromHours().
export function leadTimeMsFromHours(hours: number): number {
  return Math.max(0, hours) * 60 * 60 * 1000;
}

// How far ahead the picker is willing to look for an eligible date. Only
// bounds the "find the earliest bookable date" scan so a pathological
// availability list can't spin forever -- with the standard 6AM-11PM hours
// the answer is always today or tomorrow.
const MAX_LOOKAHEAD_DAYS = 120;

export function toDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Local midnight for a YYYY-MM-DD key. Note the lack of a "Z" -- this is
// intentionally local-time, matching slotStartMs below.
export function fromDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// Start of one slot, in local time -- byte-for-byte the same expression
// Step 1's original validator used.
export function slotStartMs(dateKey: string, hour: number): number {
  return new Date(`${dateKey}T${String(hour).padStart(2, "0")}:00`).getTime();
}

export function isSlotBookable(
  dateKey: string,
  hour: number,
  nowMs: number,
  leadTimeMs: number = BOOKING_LEAD_TIME_MS
): boolean {
  return slotStartMs(dateKey, hour) >= nowMs + leadTimeMs;
}

// The hours on `dateKey` that clear the lead-time rule. Returned in the
// same ascending order as AVAILABILITY_HOURS, so `[0]` is always the
// earliest bookable hour of that day.
export function bookableHoursForDate(
  dateKey: string,
  nowMs: number,
  leadTimeMs: number = BOOKING_LEAD_TIME_MS
): number[] {
  return AVAILABILITY_HOURS.filter((hour) => isSlotBookable(dateKey, hour, nowMs, leadTimeMs));
}

// A date is offerable exactly when at least one of its slots clears the
// lead time -- "today" typically drops off entirely, and the boundary day
// is partially available rather than all-or-nothing.
export function isDateBookable(
  dateKey: string,
  nowMs: number,
  leadTimeMs: number = BOOKING_LEAD_TIME_MS
): boolean {
  return AVAILABILITY_HOURS.some((hour) => isSlotBookable(dateKey, hour, nowMs, leadTimeMs));
}

// First date (scanning forward from today) with any bookable slot. Returns
// null only if nothing qualifies within MAX_LOOKAHEAD_DAYS, which the
// caller must treat as "no availability" rather than assuming a date.
export function earliestBookableDateKey(
  nowMs: number,
  leadTimeMs: number = BOOKING_LEAD_TIME_MS
): string | null {
  const cursor = new Date(nowMs);
  for (let i = 0; i < MAX_LOOKAHEAD_DAYS; i++) {
    const key = toDateKey(cursor);
    if (isDateBookable(key, nowMs, leadTimeMs)) return key;
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }
  return null;
}

export type CalendarCell = {
  dateKey: string;
  dayOfMonth: number;
  bookable: boolean;
  isToday: boolean;
};

export type CalendarMonth = {
  year: number;
  // 0-indexed, matching Date#getMonth().
  month: number;
  label: string;
  // Leading nulls pad the first week so the 1st lands under its real
  // weekday column; trailing nulls pad the last week to a full 7.
  cells: (CalendarCell | null)[];
};

// Weekday column headers, Monday-first -- reusing the roster's existing
// DAY_ORDER/DAY_LABELS_SHORT rather than declaring a second, subtly
// different week convention in the same app.
export const WEEKDAY_HEADERS = DAY_ORDER.map((d) => DAY_LABELS_SHORT[d]);

function weekdayColumn(date: Date): number {
  return DAY_ORDER.indexOf(date.getDay());
}

// One month's grid, with each cell pre-resolved to bookable/not so the
// calendar component stays presentational.
export function buildCalendarMonth(
  year: number,
  month: number,
  nowMs: number,
  leadTimeMs: number = BOOKING_LEAD_TIME_MS
): CalendarMonth {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = toDateKey(new Date(nowMs));

  const cells: (CalendarCell | null)[] = Array(weekdayColumn(first)).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = toDateKey(new Date(year, month, day));
    cells.push({
      dateKey,
      dayOfMonth: day,
      bookable: isDateBookable(dateKey, nowMs, leadTimeMs),
      isToday: dateKey === todayKey,
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return {
    year,
    month,
    label: first.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    cells,
  };
}

// Locale-aware long form for the confirmation line under the calendar --
// never a bare numeric format, which is ambiguous across regions.
export function formatDateKeyLong(dateKey: string): string {
  return fromDateKey(dateKey).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// True when `month` (of `year`) contains no bookable date at all, used to
// stop the calendar's "previous month" arrow from walking back into fully
// unbookable history.
export function isMonthEntirelyUnbookable(
  year: number,
  month: number,
  nowMs: number,
  leadTimeMs: number = BOOKING_LEAD_TIME_MS
): boolean {
  return !buildCalendarMonth(year, month, nowMs, leadTimeMs).cells.some((c) => c?.bookable);
}

// Every slot in this app starts on the hour: AVAILABILITY_HOURS is whole
// hours, and every picker builds its time from that list. Two admin screens
// used to offer a raw <input type="time"> / datetime-local instead, so a
// booking at 6:52 was reachable through the UI; they now share the picker,
// and this is the same rule stated where a request cannot get round it.
//
// **It is checked in the booking's own timezone, not the server's.** India is
// UTC+05:30, so 6 PM IST is 12:30 UTC -- reading the minute off the instant
// (or off a server that happens to run in UTC) would fail every correct
// booking in the clinic and pass an incorrect one 30 minutes out. The wizard
// builds slots in the *patient's* local time and records which timezone that
// was, so the answer to "is this a whole hour" is only meaningful against
// that same zone.
export const CLINIC_TIMEZONE = "Asia/Kolkata";

/**
 * The minute-past-the-hour an instant falls on, in `timeZone`. Null when the
 * instant or the zone is unusable, which the caller treats as a refusal
 * rather than as zero.
 */
export function slotMinuteInZone(iso: string, timeZone?: string | null): number | null {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  const zone = timeZone?.trim() || CLINIC_TIMEZONE;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      minute: "numeric",
      hour12: false,
    }).formatToParts(new Date(ms));
    const minute = parts.find((p) => p.type === "minute")?.value;
    return minute === undefined ? null : Number(minute);
  } catch {
    // An unknown IANA zone: fall back to the clinic's rather than accepting
    // anything, so a bad timezone string cannot be a way past this check.
    if (zone === CLINIC_TIMEZONE) return null;
    return slotMinuteInZone(iso, CLINIC_TIMEZONE);
  }
}

/** Whether an instant is exactly on the hour in the booking's own timezone. */
export function isWholeHourSlot(iso: string, timeZone?: string | null): boolean {
  const ms = new Date(iso).getTime();
  // Whole minutes first: this catches stray seconds and milliseconds, which
  // the zone-aware minute below cannot see.
  if (!Number.isFinite(ms) || ms % 60_000 !== 0) return false;
  return slotMinuteInZone(iso, timeZone) === 0;
}

/** The refusal every route gives for a slot that is not on the hour, so the
 *  message a patient or an admin reads is the same wherever it comes from. */
export const NOT_WHOLE_HOUR_ERROR =
  "Sessions start on the hour. Pick a time like 6:00 or 7:00.";
