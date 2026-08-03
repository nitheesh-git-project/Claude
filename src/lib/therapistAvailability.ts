// Pure helpers for the Therapist Roster feature -- shared between the
// therapist's own weekly-template editor, the admin Manage Roster tab, and
// (for just the hour list/labels) the /book page's time dropdown. Kept
// dependency-free so the math is unit-testable without rendering, matching
// this codebase's other *Aggregate/*Summary lib conventions.

// Slot start hours: 6AM through 11PM (6..23), i.e. 6AM-7AM .. 11PM-12AM --
// 18 one-hour slots covering the declared business day.
export const AVAILABILITY_HOURS = Array.from({ length: 18 }, (_, i) => i + 6);

// JS Date#getDay() convention (0=Sunday..6=Saturday), ordered Monday-first
// for display since that's how the roster is meant to read.
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const DAY_LABELS: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};
export const DAY_LABELS_SHORT: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const period = h < 12 ? "AM" : "PM";
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour} ${period}`;
}

// e.g. formatHourLabel(6) -> "6 AM" -- just the start of the slot, for
// contexts (like /book's dropdown) that only need a single time mark.
export function formatHourLabel(startHour: number): string {
  return hourLabel(startHour);
}

// e.g. formatHourRange(6) -> "6 AM – 7 AM", formatHourRange(23) -> "11 PM – 12 AM"
export function formatHourRange(startHour: number): string {
  return `${hourLabel(startHour)} – ${hourLabel(startHour + 1)}`;
}

export type TemplateRow = { day_of_week: number; hour: number };
export type OverrideRow = { date: string; hour: number; available: boolean };

export type SlotState = "available" | "unavailable" | "override_available" | "override_unavailable";

// A calendar date already unambiguously implies a day-of-week in every
// timezone, so dateKey -> day_of_week needs no timezone conversion here --
// see the schema.sql comment on therapist_availability_override for why.
export function dayOfWeekForDateKey(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

// Effective per-hour state for one therapist on one calendar date: the
// weekly template is the base, and any override for that exact date wins.
export function computeDayAvailability(
  dateKey: string,
  templateRows: TemplateRow[],
  overrideRows: OverrideRow[]
): Record<number, SlotState> {
  const dayOfWeek = dayOfWeekForDateKey(dateKey);
  const templateSet = new Set(
    templateRows.filter((r) => r.day_of_week === dayOfWeek).map((r) => r.hour)
  );
  const overrideMap = new Map(
    overrideRows.filter((r) => r.date === dateKey).map((r) => [r.hour, r.available])
  );

  const result: Record<number, SlotState> = {};
  for (const hour of AVAILABILITY_HOURS) {
    const override = overrideMap.get(hour);
    const base = templateSet.has(hour);
    if (override === undefined) {
      result[hour] = base ? "available" : "unavailable";
    } else {
      result[hour] = override ? "override_available" : "override_unavailable";
    }
  }
  return result;
}
