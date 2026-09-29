import { CLINIC_TIMEZONE } from "@/lib/bookingSlots";

/**
 * Calendar days and weeks, judged in the clinic's own timezone.
 *
 * A package's `max_sessions_per_week` and `min_gap_hours` are rules about
 * the clinic's week, and they were being computed in UTC. India is UTC+5:30,
 * so every clinic day from midnight to 05:29 IST belongs to the *previous*
 * UTC day -- and every one of those to the previous UTC week when it falls
 * on a Monday. A patient booking a late Sunday evening and an early Monday
 * morning session had them counted as one week; the same two an hour later
 * counted as two. The rule was not "sessions per week", it was "sessions per
 * week as seen from Greenwich", and nothing on any screen said so.
 *
 * Dependency-free on purpose, for the reason the rest of the business maths
 * is: this is a judgement that decides whether a patient may book, so it is
 * unit-tested rather than only exercised through a route.
 *
 * `Intl.DateTimeFormat` with an explicit `timeZone` is what does the work,
 * which is the same mechanism `formatDateTime.ts` uses and the same reason:
 * anything that reads the host's own clock gives a different answer on a
 * developer's machine in India and on a UTC server, and only one of those is
 * ever right.
 */

const CLINIC_DATE_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLINIC_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `YYYY-MM-DD` for the clinic-local calendar day an instant falls on. */
export function clinicDateKey(value: string | number | Date): string {
  return CLINIC_DATE_PARTS.format(new Date(value));
}

/**
 * The clinic-local calendar date as a UTC-midnight Date.
 *
 * Deliberately a *wall-clock* date with no instant meaning -- it exists only
 * to do day and week arithmetic on, where the zone has already been applied.
 * Using UTC methods on it from here on is correct rather than a bug, because
 * the offset has been removed: the value no longer represents a moment.
 */
function clinicCalendarDate(value: string | number | Date): Date {
  const [y, m, d] = clinicDateKey(value).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * A stable key for "the same clinic week", weeks starting Monday.
 *
 * ISO-like: the Thursday of a week decides which year it belongs to, which
 * is what keeps the turn of the year from splitting one week into two keys.
 * Exact ISO week *numbering* is not the point -- two slots in the same
 * clinic week agreeing on one key is.
 */
export function clinicWeekKey(value: string | number | Date): string {
  const date = clinicCalendarDate(value);
  const day = (date.getUTCDay() + 6) % 7; // Monday = 0
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() - day + 3);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7
  );
  return `${thursday.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/** Whether two instants fall on the same clinic-local calendar day. */
export function isSameClinicDay(
  a: string | number | Date,
  b: string | number | Date
): boolean {
  return clinicDateKey(a) === clinicDateKey(b);
}

/** Whether two instants fall in the same clinic-local week. */
export function isSameClinicWeek(
  a: string | number | Date,
  b: string | number | Date
): boolean {
  return clinicWeekKey(a) === clinicWeekKey(b);
}
