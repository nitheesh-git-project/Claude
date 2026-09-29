// Reading and writing the two string shapes a date control carries.
//
// `DateField` is a drop-in for the native inputs it replaces, so it speaks
// exactly what they spoke: `YYYY-MM-DD` for a date, `YYYY-MM-DDTHH:mm` for a
// date and time. That is deliberate and it is what made replacing 28 of them
// safe -- every call site's state, every query string, every route body and
// every `new Date(value)` on the other side stays byte-identical, so the swap
// moves what a person sees and nothing else.
//
// Dependency-free and unit-tested, because the cases that matter are the ones
// no browser refuses: a half-typed value, a stored value from before the
// column existed, an hour with no minutes.

export type DateTimeParts = {
  /** `YYYY-MM-DD`, or null when there is no usable date. */
  dateKey: string | null;
  /** 0-23. Null when the value carries no time. */
  hour: number | null;
  /** 0-59. Null when the value carries no time. */
  minute: number | null;
};

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whether this is a date key naming a real day. `2026-02-31` parses as digits
 *  and is not a date, and a picker that accepted it would show the wrong
 *  month. */
export function isDateKey(value: string): boolean {
  const match = DATE_KEY.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1) return false;
  // Day count for that month, leap years included -- `new Date(y, m, 0)` is
  // the last day of month `m`, 1-indexed.
  return day <= new Date(year, month, 0).getDate();
}

/**
 * Pull a date key and an optional time out of whatever a call site is holding.
 *
 * Anything unreadable comes back as nulls rather than as a guess: an empty
 * filter, a blank column and a value somebody typed by hand into a URL all mean
 * "no date chosen", and inventing today for them would silently apply a filter
 * nobody set.
 */
export function parseDateValue(value: string | null | undefined): DateTimeParts {
  const empty: DateTimeParts = { dateKey: null, hour: null, minute: null };
  if (!value) return empty;
  const text = value.trim();
  if (text === "") return empty;

  const [datePart, timePart] = text.split("T");
  if (!isDateKey(datePart)) return empty;
  if (timePart === undefined) return { dateKey: datePart, hour: null, minute: null };

  // Seconds are accepted and dropped: a native datetime-local emits `HH:mm`,
  // but a value round-tripped through a database or an ISO string can carry
  // more, and refusing it would blank a field that holds a real answer.
  const match = /^(\d{2}):(\d{2})/.exec(timePart);
  if (!match) return { dateKey: datePart, hour: null, minute: null };
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return { dateKey: datePart, hour: null, minute: null };
  return { dateKey: datePart, hour, minute };
}

/** The string to hand back to the call site. `withTime` decides which of the
 *  two shapes, never the presence of an hour -- a time-carrying field whose
 *  hour was never touched still writes midnight, exactly as the native control
 *  did. */
export function buildDateValue(
  dateKey: string | null,
  hour: number | null,
  minute: number | null,
  withTime: boolean
): string {
  if (!dateKey) return "";
  if (!withTime) return dateKey;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dateKey}T${pad(hour ?? 0)}:${pad(minute ?? 0)}`;
}

/** `2:30 pm` -- built from the numbers rather than formatted, so it needs no
 *  timezone and cannot disagree with the hour the reader just picked. */
export function formatClockLabel(hour: number, minute: number): string {
  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, "0")} ${suffix}`;
}
