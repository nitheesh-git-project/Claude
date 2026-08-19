import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { createMeetEventForConfirmedAppointment } from "@/lib/googleCalendarSync";
import { meetSyncUnclaimedFilter } from "@/lib/retryDueMeetSyncs";

// Re-attempts Meet event creation for one confirmed appointment from the
// Feature Control tab's sync health panel -- same helper every original
// confirm site (razorpay/verify, create-order recovery, assign-appointment)
// already calls, just triggered manually instead of from a payment/
// assignment write. Ignores the master google_meet_enabled toggle -- an
// admin explicitly clicking Retry is an explicit override of the
// site-wide default, not a new automatic creation.
export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: bodyError } = await parseJsonBody<{ appointmentId?: string }>(request);
  if (bodyError) return bodyError;
  const { appointmentId } = body;
  if (typeof appointmentId !== "string" || !appointmentId) {
    return NextResponse.json({ error: "appointmentId is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: appointment } = await admin
    .from("appointments")
    .select("id, status, patient_id, therapist_id, slot_time, duration_minutes, timezone, meet_link")
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (appointment.status !== "confirmed" || !appointment.therapist_id) {
    return NextResponse.json(
      { error: "Only confirmed sessions with an assigned therapist can retry Meet sync" },
      { status: 400 }
    );
  }
  // A session can already have a link and still show up in the sync health
  // list (its filter is "no link OR an error is recorded", and the two
  // aren't mutually exclusive -- e.g. a stale error from a prior failed
  // attempt never got cleared once a later attempt succeeded some other
  // way). createSessionMeetEvent has no update-in-place path, only create,
  // so calling it again here would leave a second, orphaned event sitting
  // on the calendar under the old link while this row silently moves on to
  // the new one. Nothing to retry once a link exists -- return it as-is.
  if (appointment.meet_link) {
    return NextResponse.json({ success: true, meetLink: appointment.meet_link });
  }

  // Claim the appointment through the same column the automatic sweep uses
  // (src/lib/retryDueMeetSyncs.ts), so a Retry click and a sweep running on
  // another admin's dashboard render cannot both call Google for this
  // session -- createSessionCalendarEvent only ever creates, so the loser's
  // event would sit orphaned on the calendar under a link this row no longer
  // points at. A claim older than the shared staleness window is treated as
  // abandoned and taken over, so a render that died mid-attempt cannot lock
  // this button out.
  //
  // The same write re-arms the sweep's attempt counter, because an admin
  // clicking Retry is a statement that whatever broke the sync has been dealt
  // with. Without it, a session that had already exhausted its automatic
  // attempts would be retried once by hand and then never picked up again if
  // it failed anew.
  const { data: claimed, error: claimError } = await admin
    .from("appointments")
    .update({
      google_calendar_sync_attempts: 0,
      google_calendar_sync_claimed_at: new Date().toISOString(),
    })
    .eq("id", appointmentId)
    .is("meet_link", null)
    .or(meetSyncUnclaimedFilter())
    .select("id")
    .maybeSingle();

  // An outright error here means the columns are missing on this database
  // (migration not applied yet). Unlike the sweep, which skips rather than
  // retry unguarded, a manual click must still do what the admin asked --
  // this is the pre-claim behaviour, and the window it leaves open is the
  // one that existed before the column was introduced.
  if (!claimError && !claimed) {
    return NextResponse.json(
      { error: "A sync attempt for this session is already running. Try again in a moment." },
      { status: 409 }
    );
  }

  await createMeetEventForConfirmedAppointment(admin, {
    appointmentId: appointment.id,
    patientId: appointment.patient_id,
    therapistId: appointment.therapist_id,
    slotTime: appointment.slot_time,
    durationMinutes: appointment.duration_minutes,
    timezone: appointment.timezone,
    bypassMasterToggle: true,
  });

  // Release the claim before reporting back, so a failed attempt can be
  // retried straight away rather than waiting out the staleness window.
  await admin
    .from("appointments")
    .update({ google_calendar_sync_claimed_at: null })
    .eq("id", appointmentId);

  const { data: updated } = await admin
    .from("appointments")
    .select("meet_link, google_calendar_sync_error")
    .eq("id", appointmentId)
    .maybeSingle();

  if (updated?.meet_link) {
    return NextResponse.json({ success: true, meetLink: updated.meet_link });
  }
  return NextResponse.json(
    { error: updated?.google_calendar_sync_error ?? "Retry failed" },
    { status: 502 }
  );
}
