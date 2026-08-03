import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { findTherapistConflict } from "@/lib/checkTherapistConflict";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";
import { parseJsonBody } from "@/lib/parseJsonBody";

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    appointmentId?: string;
    therapistId?: string;
  }>(request);
  if (parseError) return parseError;
  const { appointmentId, therapistId } = body;
  if (!appointmentId || !therapistId) {
    return NextResponse.json(
      { error: "Missing appointmentId or therapistId" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: therapist } = await admin
    .from("profiles")
    .select("id, active")
    .eq("id", therapistId)
    .eq("role", "therapist")
    .eq("approved", true)
    .single();

  if (!therapist) {
    return NextResponse.json(
      { error: "That therapist is not an approved therapist" },
      { status: 400 }
    );
  }
  // Always a fresh assignment (no existing state to preserve), so a
  // suspended therapist is a hard block here — unlike update-appointment,
  // which has to tolerate re-saving a session that's already assigned to
  // one.
  if (!therapist.active) {
    return NextResponse.json(
      { error: "That therapist is suspended and can't be assigned new sessions." },
      { status: 400 }
    );
  }

  const { data: appointment } = await admin
    .from("appointments")
    .select("payment_status, slot_time, duration_minutes, therapist_id, status")
    .eq("id", appointmentId)
    .single();

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  if (appointment.slot_time) {
    const conflict = await findTherapistConflict(
      admin,
      therapistId,
      appointment.slot_time,
      appointment.duration_minutes ?? BASE_DURATION_MINUTES,
      { excludeAppointmentId: appointmentId }
    );
    if (conflict) {
      return NextResponse.json(
        { error: "This therapist already has another session that overlaps this time slot." },
        { status: 400 }
      );
    }
  }

  // Only flip to "confirmed" once the patient has actually paid — otherwise
  // assigning a therapist would silently confirm an unpaid booking. If it's
  // still unpaid, the therapist is assigned but status stays "requested";
  // /api/razorpay/verify auto-confirms it the moment payment succeeds.
  const shouldConfirm = appointment.payment_status === "paid";

  const { error } = await admin
    .from("appointments")
    .update({
      therapist_id: therapistId,
      ...(shouldConfirm ? { status: "confirmed" } : {}),
    })
    .eq("id", appointmentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Re-check for a conflict now that the write has landed — the earlier
  // check and this write aren't atomic, so two concurrent assignments of
  // the same therapist to overlapping slots could both pass the earlier
  // check before either write committed, double-booking that therapist.
  // Whichever request's write lands second will see the other's
  // now-committed row here and can roll its own assignment back instead of
  // leaving a real double-booking in place.
  if (appointment.slot_time) {
    const conflictAfterWrite = await findTherapistConflict(
      admin,
      therapistId,
      appointment.slot_time,
      appointment.duration_minutes ?? BASE_DURATION_MINUTES,
      { excludeAppointmentId: appointmentId }
    );
    if (conflictAfterWrite) {
      await admin
        .from("appointments")
        .update({ therapist_id: appointment.therapist_id, status: appointment.status })
        .eq("id", appointmentId);
      return NextResponse.json(
        {
          error:
            "This therapist was just double-booked by a concurrent assignment — please try again or pick a different therapist/time.",
        },
        { status: 409 }
      );
    }
  }

  if (appointment.therapist_id !== therapistId) {
    const { error: logError } = await admin.from("appointment_reassignment_log").insert({
      appointment_id: appointmentId,
      changed_by: adminUser.id,
      old_therapist_id: appointment.therapist_id,
      new_therapist_id: therapistId,
    });
    if (logError) {
      console.error("Failed to record appointment_reassignment_log entry:", logError);
    }
  }

  return NextResponse.json({ success: true });
}
