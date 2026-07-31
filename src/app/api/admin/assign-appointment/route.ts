import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { findTherapistConflict } from "@/lib/checkTherapistConflict";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { appointmentId, therapistId } = await request.json();
  if (!appointmentId || !therapistId) {
    return NextResponse.json(
      { error: "Missing appointmentId or therapistId" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: therapist } = await admin
    .from("profiles")
    .select("id")
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

  const { data: appointment } = await admin
    .from("appointments")
    .select("payment_status, slot_time, duration_minutes, therapist_id")
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

  if (appointment.therapist_id !== therapistId) {
    await admin.from("appointment_reassignment_log").insert({
      appointment_id: appointmentId,
      changed_by: adminUser.id,
      old_therapist_id: appointment.therapist_id,
      new_therapist_id: therapistId,
    });
  }

  return NextResponse.json({ success: true });
}
