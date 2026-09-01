// Server-side parsing and validation for the two weekly-schedule save
// routes (the therapist's own and the admin's on-their-behalf) and the
// date-exception route.
//
// It lives here rather than in either route because the whole point of the
// admin door is that it cannot grow weaker rules than the therapist's own
// -- the same reasoning as carePlanAuthoring.ts. The client validates too,
// so a person sees the problem before they submit; this is what actually
// decides.

import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  rangesToHours,
  validateRanges,
  type TimeRange,
} from "@/lib/availabilityRanges";
import { DAY_ORDER } from "@/lib/therapistAvailability";

export type DayInput = { day_of_week: number; ranges: TimeRange[] };
export type TemplateSlot = { day_of_week: number; hour: number };

export const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseRange(raw: unknown): TimeRange | string {
  if (typeof raw !== "object" || raw === null) return "Malformed working period.";
  const record = raw as Record<string, unknown>;
  const startHour = record.startHour;
  const endHour = record.endHour;
  if (typeof startHour !== "number" || typeof endHour !== "number") {
    return "Malformed working period.";
  }
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) {
    return "Working hours must be whole hours.";
  }
  if (startHour < DAY_START_HOUR || endHour > DAY_END_HOUR) {
    return "Working hours are outside the bookable day.";
  }
  return { startHour, endHour };
}

/**
 * Turns the editor's `days` payload into the hour rows the template table
 * stores. Returns an error string instead of throwing, since every caller
 * hands it straight back to the person who pressed Save.
 */
export function parseWeeklyScheduleBody(
  raw: unknown
): { slots: TemplateSlot[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: "Missing days array." };
  if (raw.length > 7) return { error: "A week has seven days." };

  const seenDays = new Set<number>();
  const slots: TemplateSlot[] = [];

  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return { error: "Malformed day entry." };
    const record = entry as Record<string, unknown>;
    const day = record.day_of_week;
    if (typeof day !== "number" || !Number.isInteger(day) || !DAY_ORDER.includes(day)) {
      return { error: "Invalid day." };
    }
    if (seenDays.has(day)) return { error: "The same day was sent twice." };
    seenDays.add(day);

    const rawRanges = record.ranges;
    if (!Array.isArray(rawRanges)) return { error: "Malformed working periods." };
    // Eighteen one-hour periods is the most a day can hold; anything past
    // that is a client bug or somebody probing, not a schedule.
    if (rawRanges.length > 18) return { error: "Too many working periods in one day." };

    const ranges: TimeRange[] = [];
    for (const rawRange of rawRanges) {
      const parsed = parseRange(rawRange);
      if (typeof parsed === "string") return { error: parsed };
      ranges.push(parsed);
    }

    const invalid = validateRanges(ranges);
    if (invalid) return { error: invalid };

    for (const hour of rangesToHours(ranges)) slots.push({ day_of_week: day, hour });
  }

  return { slots };
}

/**
 * The rows one date exception writes. `ranges` empty means the therapist is
 * unavailable that whole day; the whole business day is always written, so
 * a later weekly-schedule edit can't leak through a date already answered
 * for. See exceptionRowsForRanges for that rule.
 */
export function parseExceptionRangesBody(
  raw: unknown
): { ranges: TimeRange[] } | { error: string } {
  if (raw === undefined || raw === null) return { ranges: [] };
  if (!Array.isArray(raw)) return { error: "Malformed working periods." };
  if (raw.length > 18) return { error: "Too many working periods in one day." };
  const ranges: TimeRange[] = [];
  for (const rawRange of raw) {
    const parsed = parseRange(rawRange);
    if (typeof parsed === "string") return { error: parsed };
    ranges.push(parsed);
  }
  const invalid = validateRanges(ranges);
  if (invalid) return { error: invalid };
  return { ranges };
}

/** A calendar date the app is willing to act on: well-formed, real, and not
 *  absurdly far out. Past dates are allowed deliberately -- correcting last
 *  week's roster is a legitimate admin action, and a booking's own lead-time
 *  rule is what stops anything being sold into it. */
export function parseDateKey(raw: unknown): { dateKey: string } | { error: string } {
  if (typeof raw !== "string" || !DATE_KEY_RE.test(raw)) return { error: "Invalid date." };
  const at = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== raw) {
    return { error: "Invalid date." };
  }
  return { dateKey: raw };
}

export function parseExpectedVersion(raw: unknown): { version: number | null } | { error: string } {
  if (raw === undefined || raw === null) return { version: null };
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {
    return { error: "Invalid schedule version." };
  }
  return { version: raw };
}

/** What a conflict from the save function reads as. Both save routes answer
 *  with this exact sentence, so the two editors show one message. */
export const SCHEDULE_CONFLICT_MESSAGE =
  "This schedule was changed by someone else. Reload the latest schedule before saving.";
