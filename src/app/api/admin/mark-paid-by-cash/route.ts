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
      "id, status, payment_status, category_id, therapist_id, patient_id, slot_time, duration_minutes, timezone, discount_paise, discount_source, list_price_paise"
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

  let listPricePaise = SESSION_FEE_PAISE;
  if (appointment.category_id) {
    const { data: category } = await admin
      .from("treatment_categories")
      .select("price_paise")
      .eq("id", appointment.category_id)
      .maybeSingle();
    if (category) listPricePaise = category.price_paise;
  }

  // A discount an admin already wrote onto this booking is money that was
  // never going to be handed over. This route used to record the full list
  // price regardless, so a goodwill adjustment applied and then collected in
  // cash overstated both the cash ledger and gross revenue by exactly the
  // amount given away -- and left the four discount facts describing a
  // reduction the recorded amount did not reflect. `/api/razorpay/create-
  // order` has always resolved the same adjustment; this is the same answer
  // on the path where no gateway is involved.
  const discountPaise = Math.max(0, appointment.discount_paise ?? 0);
  const amountPaise = Math.max(0, listPricePaise - discountPaise);

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
      // Written even when nothing came off, so a booking collected at list
      // price is distinguishable from one recorded before this did it --
      // the same four-facts rule create-order follows.
      list_price_paise: listPricePaise,
      discount_paise: discountPaise,
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
      { error: "This session's status changed - please refresh and try again." },
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
