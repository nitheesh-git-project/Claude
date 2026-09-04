import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { openMeetAccessForAppointment } from "@/lib/googleCalendarSync";
import { recordAdminActivity } from "@/lib/adminActivityLog";

// Turns the waiting room off on one session whose Meet space is still
// TRUSTED -- the Fix button beside the Waiting Room panel on Settings ->
// System Health, and the manual counterpart of the automatic pass in
// src/lib/retryDueMeetSyncs.ts.
//
// Deliberately not folded into /api/admin/retry-meet-sync: that route
// retries by *creating* an event and refuses outright once a link exists,
// because creating a second event for a session that already has one leaves
// an orphan on the calendar. These rows all have a link. The work here is a
// patch on the existing space, so it is safe to repeat and cannot orphan
// anything.
//
// Ignores meet_open_access_enabled for the same reason retry-meet-sync
// ignores google_meet_enabled: an admin clicking the button is an explicit
// override of the site-wide default, not a new automatic attempt.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("settings");
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
    .select("id, status, meet_link")
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (!appointment.meet_link) {
    return NextResponse.json(
      { error: "This session has no Meet link yet — retry the Calendar sync first" },
      { status: 400 }
    );
  }
  if (appointment.status === "cancelled") {
    return NextResponse.json(
      { error: "This session is cancelled — its Meet space is gone" },
      { status: 400 }
    );
  }

  // Re-arms the automatic pass's counter, on the same reasoning as the sync
  // retry above: an admin clicking Fix is a statement that whatever blocked
  // it (almost always a refresh token predating the Meet scope) has been
  // dealt with, so a row that had exhausted its attempts is picked up again
  // if this one fails anew.
  await admin.from("appointments").update({ meet_access_attempts: 0 }).eq("id", appointmentId);

  const opened = await openMeetAccessForAppointment(admin, {
    appointmentId,
    meetLink: appointment.meet_link,
  });

  if (opened) {
    // Who reopened the door on this session. Best-effort and after the
    // write, per the audit-log rule in AGENTS.md.
    await recordAdminActivity(admin, adminUser.id, {
      action: "session.open_meet_access",
      targetId: appointmentId,
    });

    return NextResponse.json({ success: true });
  }

  const { data: updated } = await admin
    .from("appointments")
    .select("meet_access_error")
    .eq("id", appointmentId)
    .maybeSingle();

  return NextResponse.json(
    { error: updated?.meet_access_error ?? "Could not open the meeting" },
    { status: 502 }
  );
}
