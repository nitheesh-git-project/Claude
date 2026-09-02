import type { OAuth2Client } from "google-auth-library";

/**
 * Google Meet's default access type is TRUSTED: only signed-in Google users
 * who are *on the invite* join straight through, and everyone else has to
 * knock so the organizer can admit them. That default is wrong for this
 * clinic in the ordinary case, not the edge case -- a patient registers with
 * whatever email address they have (often not a Google account at all, and
 * when it is, often not the one their browser is signed into), so the invite
 * match fails and both they and the therapist end up in the waiting room
 * with only the one authorizing Gmail account able to let them in. That
 * account is nobody's job to sit in front of, and a session that cannot start
 * until an admin notices is a session that does not start.
 *
 * Setting the space to OPEN removes the knock: anyone with the link joins
 * directly. There is no Calendar API field for this -- conferenceData has no
 * access-type -- so it is a second call, to the Meet REST API, patching the
 * space the Calendar event just created.
 *
 * What this cannot fix, and no code can: a meeting organized by a **personal
 * Gmail** account still requires every participant to be signed in to some
 * Google account. OPEN means "no knocking" for signed-in users; it does not
 * make the meeting joinable anonymously. Only moving the organizer to a
 * Google Workspace account does that. See README's "Meet waiting room"
 * section.
 */

const MEET_API_BASE = "https://meet.googleapis.com/v2";

// The OAuth scope the two calls below need. It is deliberately the
// *settings* scope rather than meetings.space.created: the space is created
// by the Calendar API, not by us, so "spaces this app created" does not
// cover it -- settings covers every space the authorizing user can reach
// through another app, Calendar included.
export const MEET_SPACE_SETTINGS_SCOPE =
  "https://www.googleapis.com/auth/meetings.space.settings";

type MeetSpace = { name?: string | null };

/**
 * Pulls the meeting code out of a Meet URL. The Meet API addresses a space
 * either by its server-generated id or by this code, and the code is the
 * only one of the two a Calendar event hands back -- `hangoutLink` is a URL,
 * there is no space id anywhere in the event.
 *
 * Returns null rather than guessing on anything that isn't the familiar
 * three-four-three shape: a null skips the patch and leaves knocking on,
 * which is the current behaviour, where a wrong code would be a call against
 * somebody else's meeting.
 */
export function meetingCodeFromLink(meetLink: string | null | undefined): string | null {
  if (!meetLink) return null;
  const match = meetLink.match(/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})\b/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Switches an existing Meet space to OPEN access, so both parties join
 * without anyone approving them.
 *
 * Two calls, because patch needs the space's server-generated id and all we
 * have is the meeting code from the event's `hangoutLink`: GET the space by
 * code to learn its resource name, then PATCH that name's
 * `config.accessType`.
 *
 * Never throws, and a failure here never invalidates the session: the
 * Calendar event and the Meet link are already created and usable, the
 * meeting merely keeps its waiting room. The commonest failure is a 403
 * because the stored refresh token predates this scope -- which is exactly
 * why it degrades instead of failing the booking (see
 * scripts/get-google-refresh-token.mjs).
 */
export async function openMeetSpaceAccess(
  auth: OAuth2Client,
  meetLink: string
): Promise<true | { error: string }> {
  const code = meetingCodeFromLink(meetLink);
  if (!code) {
    return { error: `Could not read a meeting code from Meet link "${meetLink}"` };
  }
  try {
    const space = await auth.request<MeetSpace>({
      url: `${MEET_API_BASE}/spaces/${encodeURIComponent(code)}`,
      method: "GET",
    });
    const name = space.data?.name;
    if (!name) {
      return { error: "Meet API did not return a space name" };
    }
    await auth.request({
      url: `${MEET_API_BASE}/${name}?updateMask=config.accessType`,
      method: "PATCH",
      data: { config: { accessType: "OPEN" } },
    });
    return true;
  } catch (err) {
    return { error: describeMeetError(err) };
  }
}

/**
 * The two failures worth naming, because both are fixed by a person doing a
 * specific thing rather than by a retry, and the raw Google message says
 * neither of them plainly.
 */
function describeMeetError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const status =
    (err as { status?: number; code?: number; response?: { status?: number } })?.status ??
    (err as { code?: number })?.code ??
    (err as { response?: { status?: number } })?.response?.status;
  if (status === 403 || /insufficient|ACCESS_TOKEN_SCOPE|PERMISSION_DENIED/i.test(message)) {
    return (
      "Meet refused the access change (403). The stored refresh token is missing the " +
      "meetings.space.settings scope, or the Google Meet API is not enabled on the " +
      "Cloud project -- re-run scripts/get-google-refresh-token.mjs. " +
      `Google said: ${message}`
    );
  }
  if (status === 404) {
    return `Meet could not find that space (404). Google said: ${message}`;
  }
  return message;
}
