import { google } from "googleapis";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";

const DEFAULT_TIMEZONE = "Asia/Kolkata";

// Very small subset of IANA-looking strings -- good enough to catch stray
// free-text values (e.g. "IST", "GMT+5:30") that Google's API would reject
// outright, without needing a full timezone database bundled in.
function normalizeTimezone(timezone: string | null | undefined): string {
  if (timezone && /^[A-Za-z_]+\/[A-Za-z_]+$/.test(timezone)) {
    return timezone;
  }
  return DEFAULT_TIMEZONE;
}

/**
 * Privileged server-only client for the dedicated Calendar. Bypasses no
 * security itself, but the refresh token gives full read/write access to
 * calendar events on the one authorized Gmail account's dedicated calendar
 * -- never import this from a Client Component or expose it to the browser.
 * Mirrors createAdminClient()'s "fresh instance per call" shape.
 */
function getCalendarClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CALENDAR_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

function logCalendarError(action: string, appointmentId: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  // invalid_grant means the refresh token itself is dead (revoked, or the
  // authorizing account's password changed) -- no automatic recovery is
  // possible short of re-running scripts/get-google-refresh-token.mjs.
  // Logged as a distinctly greppable line so it doesn't blend into
  // generic per-appointment API failure noise.
  if (message.includes("invalid_grant")) {
    console.error(
      `[googleCalendar] invalid_grant -- refresh token is dead, re-run scripts/get-google-refresh-token.mjs (appointment ${appointmentId})`
    );
  } else {
    console.error(`[googleCalendar] ${action} failed for appointment ${appointmentId}:`, err);
  }
  return message;
}

type SessionEventInput = {
  appointmentId: string;
  patientEmail: string;
  therapistEmail: string;
  slotTime: string;
  durationMinutes?: number | null;
  timezone?: string | null;
};

type CalendarEventInput = SessionEventInput & {
  // Physical address for a home visit. Rendered by Google Maps inside the
  // event, on both the patient's and the therapist's copy.
  location?: string | null;
  // Free-text shown under the event -- access notes for a home visit
  // ("2nd floor, ring twice"), which are the difference between the
  // therapist finding the door and phoning support.
  description?: string | null;
  // Whether to attach a Meet conference. False for home visits: there is
  // nothing to join, the therapist is coming to the address.
  withMeet: boolean;
  summary?: string;
};

/**
 * Creates a Calendar event inviting the patient and therapist, optionally
 * with an auto-generated Meet link. Never throws -- a Calendar-API failure
 * must never block a booking/payment/reassignment from completing (same
 * graceful-degradation philosophy as Razorpay elsewhere in this codebase).
 *
 * `withMeet: false` is what home visits use. The event still matters, and
 * arguably matters more: Calendar's `sendUpdates: "all"` invite email is the
 * ONLY outbound message this platform sends to a patient (there is no email,
 * SMS or WhatsApp integration anywhere in the codebase), so skipping the
 * event for home visits would mean someone books a therapist to come to
 * their house and receives no confirmation of any kind.
 *
 * Returns the created event's id, plus a Meet link only when one was
 * requested and issued.
 */
export async function createSessionCalendarEvent(
  input: CalendarEventInput
): Promise<{ eventId: string; meetLink: string | null } | { error: string }> {
  const {
    appointmentId,
    patientEmail,
    therapistEmail,
    slotTime,
    durationMinutes,
    timezone,
    location,
    description,
    withMeet,
    summary,
  } = input;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    return { error: "GOOGLE_CALENDAR_ID is not configured" };
  }
  try {
    const calendar = getCalendarClient();
    const tz = normalizeTimezone(timezone);
    const start = new Date(slotTime);
    const end = new Date(start.getTime() + (durationMinutes ?? BASE_DURATION_MINUTES) * 60_000);

    const res = await calendar.events.insert({
      calendarId,
      // Only meaningful when a conference is actually requested; harmless
      // otherwise, but kept conditional so a home-visit insert doesn't
      // advertise conference support it isn't using.
      conferenceDataVersion: withMeet ? 1 : 0,
      sendUpdates: "all",
      requestBody: {
        summary: summary ?? "Physiotherapy Session",
        start: { dateTime: start.toISOString(), timeZone: tz },
        end: { dateTime: end.toISOString(), timeZone: tz },
        attendees: [{ email: patientEmail }, { email: therapistEmail }],
        ...(location ? { location } : {}),
        ...(description ? { description } : {}),
        ...(withMeet
          ? {
              conferenceData: {
                // Stable, not random -- makes conference-data creation
                // idempotent against an accidental duplicate call for the
                // same appointment.
                createRequest: {
                  requestId: appointmentId,
                  conferenceSolutionKey: { type: "hangoutsMeet" },
                },
              },
            }
          : {}),
      },
    });

    const eventId = res.data.id;
    if (!eventId) {
      return { error: "Calendar API did not return an event id" };
    }
    if (withMeet) {
      const meetLink = res.data.hangoutLink;
      if (!meetLink) {
        return { error: "Calendar API did not return an event id / Meet link" };
      }
      return { eventId, meetLink };
    }
    return { eventId, meetLink: null };
  } catch (err) {
    return { error: logCalendarError("create", appointmentId, err) };
  }
}

/**
 * The original online-session entry point, preserved verbatim in behaviour
 * so no existing caller had to change: a Meet event, and a `meetLink` that
 * is always a string when the call succeeds.
 */
export async function createSessionMeetEvent(
  input: SessionEventInput
): Promise<{ eventId: string; meetLink: string } | { error: string }> {
  const result = await createSessionCalendarEvent({ ...input, withMeet: true });
  if ("error" in result) return result;
  if (!result.meetLink) {
    return { error: "Calendar API did not return an event id / Meet link" };
  }
  return { eventId: result.eventId, meetLink: result.meetLink };
}

type SessionEventUpdateInput = {
  appointmentId: string;
  eventId: string;
  patientEmail: string;
  therapistEmail: string;
  slotTime: string;
  durationMinutes?: number | null;
  timezone?: string | null;
};

/**
 * Patches an existing event's time and attendees in place -- deliberately
 * omits conferenceData so the Meet link never regenerates on a reschedule
 * or reassignment (PATCH semantics: an omitted field is left unchanged).
 * Never throws; returns false on failure.
 */
export async function updateSessionMeetEvent(input: SessionEventUpdateInput): Promise<true | { error: string }> {
  const { appointmentId, eventId, patientEmail, therapistEmail, slotTime, durationMinutes, timezone } = input;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    return { error: "GOOGLE_CALENDAR_ID is not configured" };
  }
  try {
    const calendar = getCalendarClient();
    const tz = normalizeTimezone(timezone);
    const start = new Date(slotTime);
    const end = new Date(start.getTime() + (durationMinutes ?? BASE_DURATION_MINUTES) * 60_000);

    await calendar.events.patch({
      calendarId,
      eventId,
      sendUpdates: "all",
      requestBody: {
        start: { dateTime: start.toISOString(), timeZone: tz },
        end: { dateTime: end.toISOString(), timeZone: tz },
        attendees: [{ email: patientEmail }, { email: therapistEmail }],
      },
    });
    return true;
  } catch (err) {
    return { error: logCalendarError("update", appointmentId, err) };
  }
}

/**
 * Deletes a session's Calendar event -- Google emails all current attendees
 * the cancellation automatically. A 404/410 (event already gone, e.g.
 * manually removed by a human) is treated as success, not a failure. Never
 * throws; returns false only on a genuine, unexpected API error.
 */
export async function deleteSessionMeetEvent(appointmentId: string, eventId: string): Promise<boolean> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    logCalendarError("delete", appointmentId, new Error("GOOGLE_CALENDAR_ID is not configured"));
    return false;
  }
  try {
    const calendar = getCalendarClient();
    await calendar.events.delete({ calendarId, eventId, sendUpdates: "all" });
    return true;
  } catch (err) {
    const status = (err as { code?: number; response?: { status?: number } })?.code ??
      (err as { response?: { status?: number } })?.response?.status;
    if (status === 404 || status === 410) {
      return true;
    }
    logCalendarError("delete", appointmentId, err);
    return false;
  }
}
