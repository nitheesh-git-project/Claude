import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordPaymentCapture } from "@/lib/recordPaymentCapture";
import { confirmPaidAppointment } from "@/lib/confirmPaidAppointment";
import { settleInvitesOnCapture } from "@/lib/inviteRewardsServer";
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

  const admin = createAdminClient();

  // Everything a booking becoming paid entails -- the roster's answer, the
  // atomic claim, the Meet event -- lives in one module so this route and
  // the free-confirmation route beside it cannot grow two versions of it.
  // See confirmPaidAppointment.ts.
  //
  // amount_paid_paise is deliberately not passed: /api/razorpay/create-order
  // already wrote the figure this specific order charged, and re-deriving it
  // here could disagree with the money that actually moved.
  const outcome = await confirmPaidAppointment(admin, {
    appointment,
    razorpayPaymentId: razorpay_payment_id,
  });

  if (outcome.error) {
    // The payment itself succeeded with Razorpay at this point — never tell
    // the patient it failed. Surface it as a verification failure instead so
    // the existing "contact us with payment ID X" fallback UI kicks in,
    // rather than silently showing a false "Payment Confirmed" screen while
    // the booking is actually left unpaid in the database.
    console.error("Failed to record payment for appointment", appointmentId, outcome.error);
    return NextResponse.json(
      { error: "Could not record the payment. Please contact us." },
      { status: 500 }
    );
  }

  if (!outcome.claimed) {
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

  // An invite's two halves settle here: whichever one paid for this booking
  // is spent for good, and this patient having paid is what turns their
  // inviter's promise into a reward they can spend. Both idempotent, because
  // this route and the webhook race each other by design.
  await settleInvitesOnCapture(admin, appointment.id);

  // Belt-and-suspenders: /api/razorpay/create-order already approves the
  // patient the moment they genuinely attempt this payment, so this is
  // normally a no-op by the time a payment actually verifies. Kept here too
  // in case that earlier write ever fails silently -- a successful,
  // signature-verified payment should never leave a patient unapproved.
  await approvePatientForGenuinePaymentAttempt(user.id);

  return NextResponse.json({ success: true });
}
