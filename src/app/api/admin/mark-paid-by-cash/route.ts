import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { createMeetEventForConfirmedAppointment } from "@/lib/googleCalendarSync";
import { SESSION_FEE_PAISE } from "@/lib/pricing";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("money");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { appointmentId } = await request.json();
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: appointment } = await admin
    .from("appointments")
    .select(
      "id, status, payment_status, category_id, therapist_id, patient_id, slot_time, duration_minutes, timezone"
    )
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (appointment.payment_status === "paid") {
    return NextResponse.json({ error: "This session is already marked as paid" }, { status: 400 });
  }
  if (appointment.status === "cancelled") {
    return NextResponse.json({ error: "This session was cancelled" }, { status: 400 });
  }

  let amountPaise = SESSION_FEE_PAISE;
  if (appointment.category_id) {
    const { data: category } = await admin
      .from("treatment_categories")
      .select("price_paise")
      .eq("id", appointment.category_id)
      .maybeSingle();
    if (category) amountPaise = category.price_paise;
  }

  // Same "confirm now if a therapist is already assigned" reasoning as
  // /api/razorpay/verify -- payment was the only thing this booking was
  // still waiting on.
  const shouldAutoConfirm = appointment.therapist_id && appointment.status === "requested";

  const { data: claimed, error } = await admin
    .from("appointments")
    .update({
      payment_status: "paid",
      payment_method: "cash",
      amount_paid_paise: amountPaise,
      paid_at: new Date().toISOString(),
      ...(shouldAutoConfirm ? { status: "confirmed" } : {}),
    })
    .eq("id", appointmentId)
    .eq("payment_status", "unpaid")
    .in("status", ["requested", "confirmed"])
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!claimed) {
    return NextResponse.json(
      { error: "This session's status changed — please refresh and try again." },
      { status: 409 }
    );
  }

  if (shouldAutoConfirm && appointment.therapist_id && appointment.slot_time) {
    await createMeetEventForConfirmedAppointment(admin, {
      appointmentId,
      patientId: appointment.patient_id,
      therapistId: appointment.therapist_id,
      slotTime: appointment.slot_time,
      durationMinutes: appointment.duration_minutes,
      timezone: appointment.timezone,
    });
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "session.mark_paid_cash",
    targetId: appointmentId,
  });

  return NextResponse.json({ success: true });
}
