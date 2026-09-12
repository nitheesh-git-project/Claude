import { CLINIC_DISPLAY_TIMEZONE } from "@/lib/formatDateTime";

// A session slot is the one date in this app formatted in something other
// than clinic time: it is shown in the zone the patient booked it in
// (`appointments.patient_timezone`), which is the booking's own record of
// what they were looking at when they chose it. Everything else a row is
// stamped with goes through formatDateTime.ts.
export function formatSlotTime(slotTime: string | null, timezone: string | null) {
  if (!slotTime) return "Slot to be confirmed";
  const date = new Date(slotTime);
  // A row with no recorded zone predates that column. Falling back to the
  // *runtime's* zone, which is what this did, means the server renders it in
  // UTC and the browser in the viewer's own -- two different wrong answers
  // for one booking, and a hydration mismatch between them. The clinic's own
  // zone is the honest assumption for a booking whose zone was never
  // recorded.
  return date.toLocaleString("en-US", {
    timeZone: timezone || CLINIC_DISPLAY_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  });
}
