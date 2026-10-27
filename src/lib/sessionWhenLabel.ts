import { CLINIC_DISPLAY_TIMEZONE } from "@/lib/formatDateTime";

// "Wed 28 Oct, 6-7 pm" -- a session's time the way a person says it aloud,
// always in the clinic's zone (formatDateTime.ts explains why one zone).
//
// Used where the app restates a time back to someone in a sentence rather
// than in a table row: the booking confirmation, the calendar file's title.
// Built from Intl parts rather than from a locale's own pattern so the
// output is the same on every runtime (a server and a browser must agree, and
// `en-IN` and `en-GB` disagree about "pm"/"PM").
//
// Dependency-free.

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: CLINIC_DISPLAY_TIMEZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

type ClockParts = { weekday: string; day: string; month: string; hour: number; minute: number };

function partsOf(ms: number): ClockParts | null {
  if (!Number.isFinite(ms)) return null;
  const parts = PARTS.formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { weekday: get("weekday"), day: get("day"), month: get("month"), hour: hour % 24, minute };
}

function twelveHour(hour24: number): number {
  return hour24 % 12 === 0 ? 12 : hour24 % 12;
}

function meridiem(hour24: number): "am" | "pm" {
  return hour24 < 12 ? "am" : "pm";
}

function clock(hour24: number, minute: number): string {
  return minute === 0 ? String(twelveHour(hour24)) : `${twelveHour(hour24)}:${String(minute).padStart(2, "0")}`;
}

/** "6-7 pm", "11 am-12 pm", "6:30-7:30 pm" (an en dash between the times). */
export function formatClinicTimeRange(startMs: number, durationMinutes: number): string {
  const start = partsOf(startMs);
  const end = partsOf(startMs + Math.max(0, durationMinutes) * 60_000);
  if (!start || !end) return "-";
  const startText = clock(start.hour, start.minute);
  const endText = clock(end.hour, end.minute);
  if (meridiem(start.hour) === meridiem(end.hour)) {
    return `${startText}–${endText} ${meridiem(end.hour)}`;
  }
  return `${startText} ${meridiem(start.hour)}–${endText} ${meridiem(end.hour)}`;
}

/** "Wed 28 Oct, 6-7 pm, with a physiotherapist". `who` is the tail; pass an
 *  empty string for the bare date and time. */
export function formatSessionWhen(
  start: string | number | Date,
  durationMinutes: number,
  who = "with a physiotherapist"
): string {
  const ms = start instanceof Date ? start.getTime() : typeof start === "number" ? start : new Date(start).getTime();
  const p = partsOf(ms);
  if (!p) return "-";
  const base = `${p.weekday} ${p.day} ${p.month}, ${formatClinicTimeRange(ms, durationMinutes)}`;
  return who ? `${base}, ${who}` : base;
}
