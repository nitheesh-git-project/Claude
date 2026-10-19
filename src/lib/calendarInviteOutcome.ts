/**
 * What actually happened to a session's calendar invite, as reported by
 * `createMeetEventForConfirmedAppointment()` - and the words an admin is
 * shown for it.
 *
 * Dependency-free so the wording can be tested without Google or a database.
 *
 * The New Booking screen used to say "Booked and confirmed. The calendar
 * invite is on its way." for every confirmed booking, including on a
 * deployment with no Google connection at all, where no invite is ever sent
 * (QA F-13). Calendar's invite email is the only outbound message this
 * platform sends, so an admin told it went out stops chasing a patient who
 * in fact heard nothing. The booking and the invite are two different
 * outcomes, and the message reports each one on its own.
 *
 * - `sent`: Google created the event with `sendUpdates: "all"`, so Google
 *   has emailed both people.
 * - `already_sent`: the session already had an event; nothing new went out
 *   and nothing needed to.
 * - `switched_off`: Settings -> Booking Rules has Auto-Create Meet Links off, which stops
 *   new events for video sessions. Nothing was attempted.
 * - `failed`: attempted and refused - Google not configured, a dead token,
 *   an API error. Recorded on the row (`google_calendar_sync_error`), so it
 *   shows under System Health -> Session Links and the sweep retries it.
 * - `no_email`: the patient or the therapist has no email on file, so there
 *   was nobody to invite.
 * - `unknown`: an unexpected error part-way through. The event may or may
 *   not exist - "couldn't check" is not "sent", and not "failed" either.
 */
export type CalendarInviteOutcome =
  | "sent"
  | "already_sent"
  | "switched_off"
  | "failed"
  | "no_email"
  | "unknown";

const OUTCOMES: readonly string[] = [
  "sent",
  "already_sent",
  "switched_off",
  "failed",
  "no_email",
  "unknown",
];

export function isCalendarInviteOutcome(value: unknown): value is CalendarInviteOutcome {
  return typeof value === "string" && OUTCOMES.includes(value);
}

/**
 * The sentence after "Booked and confirmed." on the admin's screen. An
 * outcome the client could not read (an older server, a missing field) is
 * treated as `unknown` rather than guessed either way.
 */
export function calendarInviteSentence(outcome: unknown): string {
  const known: CalendarInviteOutcome = isCalendarInviteOutcome(outcome) ? outcome : "unknown";
  switch (known) {
    case "sent":
      return "Google has emailed the calendar invite to the patient and the therapist.";
    case "already_sent":
      return "It already had a calendar invite, so no new one was sent.";
    case "switched_off":
      return "No calendar invite was sent: Auto-Create Meet Links is off in Settings → Booking Rules.";
    case "failed":
      return "No calendar invite was sent: Google couldn't create it. It is listed under System Health → Session Links, which says why, and will be retried.";
    case "no_email":
      return "No calendar invite was sent: the patient or the therapist has no email on file.";
    case "unknown":
      return "We couldn't confirm whether the calendar invite went out - check System Health → Session Links.";
  }
}

/** The whole success line for an admin booking. */
export function adminBookingSuccessMessage(status: unknown, invite: unknown): string {
  if (status !== "confirmed") return "Booked. It's in the queue waiting for a therapist.";
  return `Booked and confirmed. ${calendarInviteSentence(invite)}`;
}

/**
 * Whether the success line needs the warning tone: the booking worked, but
 * a confirmed session's patient has not been sent an invite, so somebody
 * may have to tell them by hand.
 */
export function adminBookingInviteNeedsAttention(status: unknown, invite: unknown): boolean {
  return status === "confirmed" && invite !== "sent" && invite !== "already_sent";
}
