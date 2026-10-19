import { NextRequest, NextResponse } from "next/server";
import { recordUserActivity } from "@/lib/userActivityLog";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActiveAndApproved, profileCheckUnavailable } from "@/lib/supabase/requireActiveProfile";
import { guardCommunication } from "@/lib/communicationFlags";
import { serverError } from "@/lib/apiError";
import { serverNowMs } from "@/lib/debugClock";
import { formatClinicDateTime } from "@/lib/formatDateTime";
import {
  isSummaryEditable,
  sameSummaryText,
  summaryTextOf,
  validateSessionSummary,
} from "@/lib/sessionSummary";

const CHANGED_ELSEWHERE =
  "This summary was changed in another window. Close this one and reopen the session to see the latest version.";

/**
 * A therapist writes the patient's summary of one of their own sessions --
 * the "Shared with the patient" half of the session note dialog.
 *
 * A separate route and a separate table from the note on purpose: the note
 * is clinician-only and stays so (session_notes has no patient policy), and
 * this is the one thing from a session the patient reads. Same gates as the
 * note -- the session is the caller's own and was delivered -- plus the
 * contact scanner, because this is therapist-to-patient text.
 *
 * Creates the summary, or edits it inside its 24-hour window, keeping what
 * it replaced in session_summary_revisions. A summary the patient may have
 * read can be corrected but not blanked.
 */
export async function POST(request: NextRequest) {
  // Who is asking, before anything they sent is looked at.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    appointmentId?: unknown;
    whatWeDid?: unknown;
    beforeNextTime?: unknown;
    /** The version the editor opened (updated_at ?? created_at), or null. */
    baseUpdatedAt?: unknown;
  }>(request);
  if (parseError) return parseError;

  const appointmentId = typeof body.appointmentId === "string" ? body.appointmentId : "";
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }
  const checked = validateSessionSummary(body);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }

  const active = await isProfileActiveAndApproved(user.id);
  if (active === null) return profileCheckUnavailable();
  if (!active) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  // The session, and who it belongs to, come from the database -- never
  // from the body. The patient the summary is filed under is the session's.
  const { data: appointment, error: appointmentError } = await admin
    .from("appointments")
    .select("id, patient_id, therapist_id, status, slot_time, no_show")
    .eq("id", appointmentId)
    .maybeSingle();
  if (appointmentError) return serverError("therapist/session-summary/submit", appointmentError);
  if (!appointment || appointment.therapist_id !== user.id) {
    return NextResponse.json({ error: "That session isn't yours." }, { status: 403 });
  }
  if (appointment.status !== "completed" && appointment.status !== "confirmed") {
    return NextResponse.json(
      { error: "A summary is written for a session that was confirmed and took place." },
      { status: 400 }
    );
  }
  if (appointment.no_show) {
    return NextResponse.json(
      { error: "This session was marked as a no-show, so there is nothing to summarise for the patient." },
      { status: 400 }
    );
  }
  // The same clock as the note and Done (the debug bar's while it is on).
  const slotMs = appointment.slot_time ? new Date(appointment.slot_time).getTime() : 0;
  if (appointment.status !== "completed" && slotMs > serverNowMs(request)) {
    return NextResponse.json(
      { error: `You can write the summary from ${formatClinicDateTime(slotMs)}, when the session starts.` },
      { status: 400 }
    );
  }

  const { data: existing, error: existingError } = await admin
    .from("session_summaries")
    .select("id, created_at, updated_at, what_we_did, before_next_time")
    .eq("appointment_id", appointmentId)
    .maybeSingle();
  if (existingError) return serverError("therapist/session-summary/submit", existingError);

  const text = checked.value;

  if (!existing && checked.empty) {
    // Optional, and nothing was written: nothing to store.
    return NextResponse.json({ success: true, written: false });
  }

  if (existing) {
    if (checked.empty) {
      return NextResponse.json(
        { error: "The patient may already have read this summary, so it can be corrected but not removed." },
        { status: 400 }
      );
    }
    if (!isSummaryEditable(existing, Date.now())) {
      return NextResponse.json(
        { error: "This summary is locked - it can be edited for 24 hours after it's written." },
        { status: 409 }
      );
    }
    const currentVersion = existing.updated_at ?? existing.created_at;
    if (
      typeof body.baseUpdatedAt === "string" &&
      Date.parse(body.baseUpdatedAt) !== Date.parse(currentVersion)
    ) {
      return NextResponse.json({ error: CHANGED_ELSEWHERE }, { status: 409 });
    }
    // Saving the note re-sends the summary unchanged; that is not an edit,
    // and must not write a revision of identical text.
    if (sameSummaryText(summaryTextOf(existing), text)) {
      return NextResponse.json({ success: true, written: false });
    }
  }

  const leak = await guardCommunication(
    admin,
    [
      { surface: "session_summary", text: text.whatWeDid },
      { surface: "session_summary", text: text.beforeNextTime },
    ],
    { authorId: user.id, authorRole: "therapist", patientId: appointment.patient_id }
  );
  if (leak.blockedMessage) {
    return NextResponse.json({ error: leak.blockedMessage }, { status: 400 });
  }

  if (existing) {
    // Keep what is being replaced, or change nothing.
    const { error: revisionError } = await admin.from("session_summary_revisions").insert({
      summary_id: existing.id,
      what_we_did: existing.what_we_did,
      before_next_time: existing.before_next_time,
    });
    if (revisionError) {
      return serverError("therapist/session-summary/submit", revisionError, {
        message: "Could not save your changes. The summary is unchanged -- please try again.",
      });
    }
    const guard = admin
      .from("session_summaries")
      .update({
        what_we_did: text.whatWeDid,
        before_next_time: text.beforeNextTime,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    const { data: saved, error } = await (existing.updated_at
      ? guard.eq("updated_at", existing.updated_at)
      : guard.is("updated_at", null)
    )
      .select("id")
      .maybeSingle();
    if (error) return serverError("therapist/session-summary/submit", error);
    if (!saved) return NextResponse.json({ error: CHANGED_ELSEWHERE }, { status: 409 });
  } else {
    const { error } = await admin.from("session_summaries").insert({
      appointment_id: appointmentId,
      patient_id: appointment.patient_id,
      therapist_id: user.id,
      what_we_did: text.whatWeDid,
      before_next_time: text.beforeNextTime,
    });
    if (error) {
      // One per session: a second window got there first.
      if (error.code === "23505") return NextResponse.json({ error: CHANGED_ELSEWHERE }, { status: 409 });
      return serverError("therapist/session-summary/submit", error);
    }
  }

  await recordUserActivity(admin, {
    action: "session_summary.written",
    actor: { id: user.id, role: "therapist" },
    appointmentId,
    patientId: appointment.patient_id,
    therapistId: user.id,
    note: existing ? "edited" : undefined,
    details: { updated: !!existing },
  });
  return NextResponse.json({ success: true, written: true, updated: !!existing });
}
