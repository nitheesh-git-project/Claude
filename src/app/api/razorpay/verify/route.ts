import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  pickAutoAssignTherapist,
  readAutoAssignSettings,
} from "@/lib/autoAssignTherapist";
import { recordPaymentCapture } from "@/lib/recordPaymentCapture";
import { createMeetEventForConfirmedAppointment } from "@/lib/googleCalendarSync";
import { approvePatientForGenuinePaymentAttempt } from "@/lib/supabase/requireActiveProfile";

export async function POST(request: NextRequest) {

  // Who is asking, before anything the caller sent is looked at. An
  // anonymous request is refused here rather than after body validation,
  // so an unauthenticated caller never drives this route's parsing and is
  // never told what shape the request should have been.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const {
    appointmentId,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = await request.json();

  if (!appointmentId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ error: "Missing payment details" }, { status: 400 });
  }


  const { data: appointment } = await supabase
    .from("appointments")
    .select(
      "id, patient_id, razorpay_order_id, therapist_id, status, slot_time, duration_minutes, timezone, visit_mode, preferred_therapist_id"
    )
    .eq("id", appointmentId)
    .eq("patient_id", user.id)
    .single();

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (appointment.razorpay_order_id !== razorpay_order_id) {
    return NextResponse.json({ error: "Order mismatch" }, { status: 400 });
  }

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  const signatureValid =
    expectedSignature.length === razorpay_signature.length &&
    crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(razorpay_signature)
    );

  if (!signatureValid) {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 });
  }

  // A therapist already being assigned means everything else was already
  // arranged (e.g. a hospital referral) — payment was the only thing
  // pending, so confirm it now rather than leaving it stuck on
  // "requested" waiting for a separate admin action.
  //
  // When nobody is assigned yet, the roster is asked whether the answer is
  // unambiguous: exactly one approved, active, not-on-leave therapist who
  // works that hour and has no clashing session. If so the session is
  // assigned and confirmed here rather than waiting for an admin to open
  // the dashboard, which was the longest unnecessary wait in the funnel.
  // Anything less certain than "exactly one" returns null and the
  // appointment stays in the queue exactly as before — see
  // autoAssignTherapist.ts for why the tie-break is deliberately "don't".
  const admin = createAdminClient();

  let assignedTherapistId = appointment.therapist_id as string | null;
  let autoAssignReason: string | null = null;
  if (!assignedTherapistId && appointment.status === "requested" && appointment.slot_time) {
    const settings = await readAutoAssignSettings(admin);
    const picked = await pickAutoAssignTherapist(admin, {
      appointmentId: appointment.id,
      slotTime: appointment.slot_time,
      durationMinutes: appointment.duration_minutes,
      preferredTherapistId: appointment.preferred_therapist_id,
      visitMode: appointment.visit_mode,
      travelBufferMinutes: settings.travelBufferMinutes,
    });
    if (picked) {
      assignedTherapistId = picked.therapistId;
      autoAssignReason = picked.reason;
    }
  }

  const shouldAutoConfirm = assignedTherapistId && appointment.status === "requested";

  // amount_paid_paise is already set by /api/razorpay/create-order at the
  // moment the order was created (resolved from the appointment's category
  // price, or the flat base fee) — that's the real amount this specific
  // order charged, so it's not re-derived or overwritten here.

  // Atomic claim: only actually confirm/mark-paid if the appointment is
  // still in the same active state it was in when read above. Without this,
  // an admin cancelling the appointment in the moment between the patient's
  // checkout succeeding and this callback landing would let this write go
  // through anyway — either resurrecting a cancelled booking back to
  // "confirmed", or marking a cancelled (and possibly already-refunded)
  // appointment as paid with no refund ever attempted for this charge.
  const { data: claimed, error: claimError } = await admin
    .from("appointments")
    .update({
      payment_status: "paid",
      razorpay_payment_id,
      paid_at: new Date().toISOString(),
      ...(shouldAutoConfirm
        ? {
            status: "confirmed",
            // Written in the same claim as the confirmation, so a session
            // can never be confirmed with nobody on it.
            ...(autoAssignReason ? { therapist_id: assignedTherapistId } : {}),
          }
        : {}),
    })
    .eq("id", appointmentId)
    .in("status", ["requested", "confirmed"])
    .select("id")
    .maybeSingle();

  if (claimError) {
    // The payment itself succeeded with Razorpay at this point — never tell
    // the patient it failed. Surface it as a verification failure instead so
    // the existing "contact us with payment ID X" fallback UI kicks in,
    // rather than silently showing a false "Payment Confirmed" screen while
    // the booking is actually left unpaid in the database.
    console.error("Failed to record payment for appointment", appointmentId, claimError);
    return NextResponse.json(
      { error: "Could not record the payment. Please contact us." },
      { status: 500 }
    );
  }

  if (!claimed) {
    // The appointment's status changed between checkout and this callback
    // (almost certainly: it was cancelled) — but Razorpay has genuinely
    // already charged the patient by this point, so the payment must not
    // simply vanish even though the booking itself can't be resurrected.
    // Record the charge without touching status, so it's visible on the
    // appointment for manual reconciliation/refund instead of being lost.
    const { error: recordError } = await admin
      .from("appointments")
      .update({
        payment_status: "paid",
        razorpay_payment_id,
        paid_at: new Date().toISOString(),
      })
      .eq("id", appointmentId);
    if (recordError) {
      console.error(
        "Failed to record a payment against a no-longer-active appointment",
        appointmentId,
        recordError
      );
    }
    return NextResponse.json(
      {
        error: `This booking is no longer active (it may have been cancelled) — we've recorded your payment for manual review and will follow up. Please also contact us with payment ID ${razorpay_payment_id}.`,
      },
      { status: 409 }
    );
  }

  // The atomic claim above already applied shouldAutoConfirm inside the
  // same write -- if it succeeded, the status change (if any) actually
  // stuck, so it's safe to create the Meet event now.
  if (shouldAutoConfirm && assignedTherapistId && appointment.slot_time) {
    await createMeetEventForConfirmedAppointment(admin, {
      appointmentId,
      patientId: appointment.patient_id,
      therapistId: assignedTherapistId,
      slotTime: appointment.slot_time,
      durationMinutes: appointment.duration_minutes,
      timezone: appointment.timezone,
    });
  }

  // Record the money itself, in the one place that holds every payment
  // regardless of what it bought. Idempotent: if the webhook already
  // handled this capture, this finds it captured and changes nothing.
  // Best-effort and after the write above -- the patient has already been
  // charged by this point, so a failure here is a server-log problem, not
  // something to report back as a failed payment.
  await recordPaymentCapture(admin, {
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
  });

  // Belt-and-suspenders: /api/razorpay/create-order already approves the
  // patient the moment they genuinely attempt this payment, so this is
  // normally a no-op by the time a payment actually verifies. Kept here too
  // in case that earlier write ever fails silently -- a successful,
  // signature-verified payment should never leave a patient unapproved.
  await approvePatientForGenuinePaymentAttempt(user.id);

  return NextResponse.json({ success: true });
}
