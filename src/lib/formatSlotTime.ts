import { CLINIC_DISPLAY_TIMEZONE } from "@/lib/formatDateTime";

// A session slot is the one date in this app formatted in something other
// than clinic time: it is shown in the zone the patient booked it in
// (`appointments.timezone`), which is the booking's own record of what they
// were looking at when they chose it. Everything else a row is stamped with
// goes through formatDateTime.ts.
//
// It used to print in US style ("Nov 27, 2026, 10:00 AM") with no zone, beside
// clinic-time figures in Indian style ("3:30 pm"). A patient who booked from
// a UTC browser showed as 10:00 AM on the same screen that said 3:30 pm for
// the same session -- a tester read it as three different times. Now it uses
// the app's one style, and a slot booked in another zone says which zone and
// carries the clinic's time beside it: "27 Nov 2026, 10:00 am UTC (3:30 pm IST)".

const LOCALE = "en-IN";
const OPTIONS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
};

function zoneName(date: Date, timeZone: string): string {
  return (
    new Intl.DateTimeFormat(LOCALE, { timeZone, timeZoneName: "short" })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName")?.value ?? timeZone
  );
}

function usable(timeZone: string | null): string {
  if (!timeZone) return CLINIC_DISPLAY_TIMEZONE;
  try {
    new Intl.DateTimeFormat(LOCALE, { timeZone });
    return timeZone;
  } catch {
    return CLINIC_DISPLAY_TIMEZONE;
  }
}

export function formatSlotTime(slotTime: string | null, timezone: string | null) {
  if (!slotTime) return "Slot to be confirmed";
  const date = new Date(slotTime);
  if (Number.isNaN(date.getTime())) return "Slot to be confirmed";
  // A row with no recorded zone predates that column. The clinic's own zone
  // is the honest assumption for it -- never the runtime's, which renders
  // UTC on the server and the viewer's zone in the browser.
  const zone = usable(timezone);
  const own = new Intl.DateTimeFormat(LOCALE, { ...OPTIONS, timeZone: zone }).format(date);
  const sameClock =
    zone === CLINIC_DISPLAY_TIMEZONE ||
    new Intl.DateTimeFormat(LOCALE, { ...OPTIONS, timeZone: CLINIC_DISPLAY_TIMEZONE }).format(date) === own;
  if (sameClock) return own;
  const clinicTime = new Intl.DateTimeFormat(LOCALE, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: CLINIC_DISPLAY_TIMEZONE,
  }).format(date);
  return `${own} ${zoneName(date, zone)} (${clinicTime} ${zoneName(date, CLINIC_DISPLAY_TIMEZONE)})`;
}
