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

/**
 * Creates a Calendar event with an auto-generated Meet link, inviting the
 * patient and therapist. Never throws -- a Calendar-API failure must never
 * block a booking/payment/reassignment from completing (same graceful-
 * degradation philosophy as Razorpay elsewhere in this codebase). Returns
 * null on failure; callers should record the error message via a second
 * call's caught reason, not by inspecting this return value.
 */
export async function createSessionMeetEvent(
  input: SessionEventInput
): Promise<{ eventId: string; meetLink: string } | { error: string }> {
  const { appointmentId, patientEmail, therapistEmail, slotTime, durationMinutes, timezone } = input;
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
      conferenceDataVersion: 1,
      sendUpdates: "all",
      requestBody: {
        summary: "Physiotherapy Session",
        start: { dateTime: start.toISOString(), timeZone: tz },
        end: { dateTime: end.toISOString(), timeZone: tz },
        attendees: [{ email: patientEmail }, { email: therapistEmail }],
        conferenceData: {
          // Stable, not random -- makes conference-data creation idempotent
          // against an accidental duplicate call for the same appointment.
          createRequest: {
            requestId: appointmentId,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });

    const eventId = res.data.id;
    const meetLink = res.data.hangoutLink;
    if (!eventId || !meetLink) {
      return { error: "Calendar API did not return an event id / Meet link" };
    }
    return { eventId, meetLink };
  } catch (err) {
    return { error: logCalendarError("create", appointmentId, err) };
  }
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
