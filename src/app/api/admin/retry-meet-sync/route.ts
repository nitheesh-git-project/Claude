import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { createMeetEventForConfirmedAppointment } from "@/lib/googleCalendarSync";

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
    .select("id, status, patient_id, therapist_id, slot_time, duration_minutes, timezone")
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

  await createMeetEventForConfirmedAppointment(admin, {
    appointmentId: appointment.id,
    patientId: appointment.patient_id,
    therapistId: appointment.therapist_id,
    slotTime: appointment.slot_time,
    durationMinutes: appointment.duration_minutes,
    timezone: appointment.timezone,
    bypassMasterToggle: true,
  });

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
