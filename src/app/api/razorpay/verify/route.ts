import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const {
    appointmentId,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = await request.json();

  if (!appointmentId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ error: "Missing payment details" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: appointment } = await supabase
    .from("appointments")
    .select("id, patient_id, razorpay_order_id, therapist_id, status")
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
  const shouldAutoConfirm = appointment.therapist_id && appointment.status === "requested";

  // amount_paid_paise is already set by /api/razorpay/create-order at the
  // moment the order was created (resolved from the appointment's category
  // price, or the flat base fee) — that's the real amount this specific
  // order charged, so it's not re-derived or overwritten here.
  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("appointments")
    .update({
      payment_status: "paid",
      razorpay_payment_id,
      paid_at: new Date().toISOString(),
      ...(shouldAutoConfirm ? { status: "confirmed" } : {}),
    })
    .eq("id", appointmentId);

  if (updateError) {
    // The payment itself succeeded with Razorpay at this point — never tell
    // the patient it failed. Surface it as a verification failure instead so
    // the existing "contact us with payment ID X" fallback UI kicks in,
    // rather than silently showing a false "Payment Confirmed" screen while
    // the booking is actually left unpaid in the database.
    console.error("Failed to record payment for appointment", appointmentId, updateError);
    return NextResponse.json(
      { error: "Could not record the payment. Please contact us." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
