// How fast the clinic says it will answer, in one place.
//
// Two patient-facing sentences quote a number that is the clinic's promise,
// not the code's:
//
//   - Booking Step 1/3: "We confirm within N hours; if this time can't be met
//     we offer another or refund in full."
//   - The waiting screen: "usually within 1 working day".
//
// They belong in Settings. Neither has a `site_settings` column yet (a column
// is a schema change, which is the owner's to apply), so for now the DEFAULTS
// below are the answer. The readers take whatever a future settings row holds
// and fall back to the default for anything unusable, so wiring the setting
// later is: add the column, add it to the page's select, pass the value --
// nothing here changes. Until then nothing should select a column that does
// not exist (one unknown column fails the whole query).
//
// A constant is the fallback, never the answer: callers take the number as a
// prop rather than importing the default into a component.

/** Hours the clinic says it takes to confirm a requested booking time. */
export const DEFAULT_BOOKING_CONFIRMATION_HOURS = 4;
/** Working days a new account may wait for the clinic to open it. */
export const DEFAULT_APPROVAL_WAIT_WORKING_DAYS = 1;

function wholeNumberInRange(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

export function bookingConfirmationHours(raw?: unknown): number {
  return wholeNumberInRange(raw, 1, 72, DEFAULT_BOOKING_CONFIRMATION_HOURS);
}

export function approvalWaitWorkingDays(raw?: unknown): number {
  return wholeNumberInRange(raw, 1, 10, DEFAULT_APPROVAL_WAIT_WORKING_DAYS);
}

/** "4 hours" / "1 hour". */
export function hoursPhrase(hours: number): string {
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/** Step 1 and Step 3: what choosing a time actually does. A request, with the
 *  two honest ways it can end if the clinic cannot meet it. */
export function requestedTimeNotice(hours: number): string {
  return (
    `The time you pick is a request. We confirm within ${hoursPhrase(hours)}. ` +
    `If we can't meet it, we offer you another time or refund you in full.`
  );
}

/** "usually within 1 working day" / "usually within 3 working days". */
export function approvalWaitPhrase(days: number): string {
  return `usually within ${days} working day${days === 1 ? "" : "s"}`;
}
