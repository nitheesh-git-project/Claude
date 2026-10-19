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

// ---------------------------------------------------------------------------
// What a patient is promised before any invite exists.
//
// The owner's rule: a patient is told "we'll email you a calendar invite"
// only when this deployment will actually send one for that kind of session
// -- Google's credentials configured and, for a video session, Auto-Create
// Meet Links switched on. Otherwise they are told what is always true: the
// session and its link show under Sessions on their dashboard before it
// starts. The screens used to promise an invite on a deployment with no
// Google connection at all (the patient-facing half of QA F-13).

/** Whether a new session of each kind gets a calendar invite here. */
export type InviteDelivery = { online: boolean; homeVisit: boolean };

/** The answer when it could not be worked out: promise nothing. */
export const NO_INVITE_DELIVERY: InviteDelivery = { online: false, homeVisit: false };

/**
 * The same judgement `createMeetEventForConfirmedAppointment` makes when it
 * runs: no credentials, no event for anyone; Meet switched off stops video
 * sessions' events only (a home visit's invite carries the address and is
 * never gated by it). `meetEnabled` null means the column is absent, which
 * that function treats as on; an unreadable settings row is "couldn't
 * check", so nothing is promised.
 */
export function inviteDeliveryFor(input: {
  googleConfigured: boolean;
  meetEnabled: boolean | null;
  settingsReadFailed?: boolean;
}): InviteDelivery {
  if (!input.googleConfigured) return NO_INVITE_DELIVERY;
  return {
    online: !input.settingsReadFailed && input.meetEnabled !== false,
    homeVisit: true,
  };
}

/** Accepts whatever a client component was handed, defaulting to no promise. */
export function normalizeInviteDelivery(value: unknown): InviteDelivery {
  if (!value || typeof value !== "object") return NO_INVITE_DELIVERY;
  const v = value as Record<string, unknown>;
  return { online: v.online === true, homeVisit: v.homeVisit === true };
}

export type PatientInviteContext =
  /** /book's confirmation, after payment or with pay-later. */
  | "online_booked"
  /** /patient/register (a hospital referral's invite), after payment. */
  | "online_registered"
  /** /book-home-visit's confirmation once a visit is booked. */
  | "home_visit_booked"
  /** A therapist's suggested time, just accepted. Either kind of session. */
  | "suggestion_accepted"
  /** The illustrative "Session confirmed" chip on the public pages. */
  | "example_chip";

/** The sentence a patient reads about how they will hear about the session. */
export function patientInviteLine(
  context: PatientInviteContext,
  delivery: InviteDelivery,
  options: { visitMode?: "online" | "home_visit" } = {}
): string {
  switch (context) {
    case "online_booked":
      return delivery.online
        ? "We'll confirm your exact slot, then email you a calendar invite with the video call link - it also shows on your dashboard."
        : "We'll confirm your exact slot. Your video call link will appear under Sessions on your dashboard before the session.";
    case "online_registered":
      return delivery.online
        ? "We'll email you a calendar invite with the video call link - it also shows on your dashboard."
        : "Your video call link will appear under Sessions on your dashboard before the session.";
    case "home_visit_booked":
      return delivery.homeVisit
        ? "We'll confirm your therapist and send a calendar invite with the address and time once everything's set."
        : "We'll confirm your therapist. The visit's time and address will show under Sessions on your dashboard once everything's set.";
    case "suggestion_accepted": {
      const invites = options.visitMode === "home_visit" ? delivery.homeVisit : delivery.online;
      return invites
        ? "The clinic is confirming your therapist - the calendar invite follows once it's confirmed."
        : "The clinic is confirming your therapist - it will show under Sessions on your dashboard once it's confirmed.";
    }
    case "example_chip":
      // True of both kinds only when both get one; otherwise the dashboard,
      // which is where every session's details are in every deployment.
      return delivery.online && delivery.homeVisit
        ? "Calendar invite on its way."
        : "Details on your dashboard before it starts.";
  }
}
