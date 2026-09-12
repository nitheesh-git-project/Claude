// One answer to "what time does this say", for the whole app.
//
// `toLocaleString()` with no `timeZone` formats in whatever zone the
// *runtime* is in. On the server that is the host's, which is UTC -- so a
// session booked for 6 PM IST rendered as "12:30 PM" on the patient's own
// Overview, and the same call inside a client component rendered it in the
// browser's zone instead, which is a different wrong answer and a hydration
// mismatch between them. Ninety-one call sites were formatting this way.
//
// Every figure here is pinned to **`Asia/Kolkata`** and `en-IN`. This clinic
// operates in one country, its admins are there, and the alternative -- each
// viewer's own zone -- means two people reading the same screen disagree
// about when a session is, with nothing on screen to say why. That is the
// same reasoning `formatIST` was written with; this module is that decision
// applied everywhere rather than on one surface.
//
// **A session slot is the one exception.** It is formatted in the zone the
// patient booked it in (`appointments.patient_timezone`), by
// `formatSlotTime` -- the booking's own record of what the patient was
// looking at when they chose it. Use that for a slot; use these for
// everything else a row is stamped with.

export const CLINIC_DISPLAY_TIMEZONE = "Asia/Kolkata";
const LOCALE = "en-IN";

function formatter(options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: CLINIC_DISPLAY_TIMEZONE });
}

const DATE = formatter({ day: "numeric", month: "short", year: "numeric" });
const DATE_SHORT = formatter({ day: "numeric", month: "short" });
const TIME = formatter({ hour: "numeric", minute: "2-digit", hour12: true });
const DATE_TIME = formatter({
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** An unreadable or missing date renders as a dash rather than
 *  "Invalid Date", which is a developer's string on a patient's screen. */
function safe(value: string | number | Date | null | undefined, f: Intl.DateTimeFormat) {
  if (value === null || value === undefined || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return f.format(date);
}

/** `12 Sep 2026` */
export function formatClinicDate(value: string | number | Date | null | undefined) {
  return safe(value, DATE);
}

/** `12 Sep` -- for a strip where the year is obvious from context. */
export function formatClinicDateShort(value: string | number | Date | null | undefined) {
  return safe(value, DATE_SHORT);
}

/** `6:00 pm` */
export function formatClinicTime(value: string | number | Date | null | undefined) {
  return safe(value, TIME);
}

/** `12 Sep 2026, 6:00 pm` */
export function formatClinicDateTime(value: string | number | Date | null | undefined) {
  return safe(value, DATE_TIME);
}
