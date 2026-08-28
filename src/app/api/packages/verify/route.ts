import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordPaymentCapture } from "@/lib/recordPaymentCapture";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";
import { bookPackageSession } from "@/lib/bookPackageSession";

const MAX_NOTES_LENGTH = 1000;

export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{
    packagePurchaseId?: string;
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
    // Optional: booked from the wizard's package-purchase flow, where
    // Step 1 already picked session 1's slot before checkout opened. A
    // purchase made without these (the dashboard's plain "Buy" button) is
    // left with 0 sessions scheduled, same as before this existed.
    slotDateTime?: string;
    timezone?: string;
    notes?: string;
    preferredTherapistId?: string;
  }>(request);
  if (parseError) return parseError;
  const {
    packagePurchaseId,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    slotDateTime,
    timezone,
    notes,
    preferredTherapistId,
  } = body;

  if (!packagePurchaseId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ error: "Missing payment details" }, { status: 400 });
  }
  if (notes && notes.length > MAX_NOTES_LENGTH) {
    return NextResponse.json(
      { error: `Notes must be ${MAX_NOTES_LENGTH} characters or less.` },
      { status: 400 }
    );
  }
  // Same "future, parseable" bar as book-with-package's own pre-check --
  // the 12-hour lead time itself is enforced client-side by the wizard's
  // Step 1 (BOOKING_LEAD_TIME_HOURS) before checkout ever opens, exactly
  // as it is for a direct (non-package) booking.
  let slotTimestamp: number | null = null;
  if (slotDateTime !== undefined) {
    slotTimestamp = new Date(slotDateTime).getTime();
    if (Number.isNaN(slotTimestamp)) {
      return NextResponse.json({ error: "Invalid slotDateTime" }, { status: 400 });
    }
    if (slotTimestamp <= Date.now()) {
      return NextResponse.json({ error: "The slot must be in the future" }, { status: 400 });
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: purchase } = await admin
    .from("patient_package_purchases")
    .select(
      "id, patient_id, package_id, category_id, session_count, sessions_used, amount_paid_paise, payment_status, status, locked_therapist_id, razorpay_order_id"
    )
    .eq("id", packagePurchaseId)
    .single();

  if (!purchase || purchase.patient_id !== user.id) {
    return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
  }
  if (purchase.razorpay_order_id !== razorpay_order_id) {
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

  // The validity window starts counting from the moment payment actually
  // clears, not from when checkout began -- an abandoned/failed order
  // never gets this far, so it never eats into anyone's window. A blank
  // package-level validity_days falls through to the site-wide default,
  // same fallback every other package rule uses.
  const [{ data: packageRow }, { data: settingsRow }] = await Promise.all([
    admin
      .from("treatment_category_packages")
      .select("validity_days, session_duration_minutes")
      .eq("id", purchase.package_id)
      .maybeSingle(),
    admin.from("site_settings").select("package_default_validity_days").maybeSingle(),
  ]);
  const validityDays =
    packageRow?.validity_days ?? settingsRow?.package_default_validity_days ?? DEFAULT_ADMIN_SETTINGS.packageDefaultValidityDays;
  const paidAt = new Date();
  const expiresAt = new Date(paidAt.getTime() + validityDays * 86_400_000).toISOString();

  const { error: updateError } = await admin
    .from("patient_package_purchases")
    .update({
      payment_status: "paid",
      razorpay_payment_id,
      paid_at: paidAt.toISOString(),
      expires_at: expiresAt,
    })
    .eq("id", packagePurchaseId);

  if (updateError) {
    console.error("Failed to record payment for package purchase", packagePurchaseId, updateError);
    return NextResponse.json(
      { error: "Could not record the payment. Please contact us." },
      { status: 500 }
    );
  }

  try {
    await admin.from("package_purchase_events").insert({
      purchase_id: packagePurchaseId,
      event_type: "purchased",
      actor_id: user.id,
      detail: { amountPaidPaise: purchase.amount_paid_paise, expiresAt },
    });
  } catch (eventError) {
    console.error("Failed to log purchased event for purchase", packagePurchaseId, eventError);
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
    amountPaise: purchase.amount_paid_paise ?? null,
  });

  if (!slotDateTime) {
    return NextResponse.json({ success: true });
  }

  // Book session 1 -- same race-safe claim-and-insert every other package
  // booking path uses, so a purchase made through the wizard behaves
  // identically to one redeemed later from the dashboard.
  const result = await bookPackageSession(admin, {
    purchase: {
      ...purchase,
      payment_status: "paid",
      status: purchase.status,
      expires_at: expiresAt,
    },
    slotDateTime,
    timezone,
    notes,
    actorId: user.id,
    sessionDurationMinutesOverride: packageRow?.session_duration_minutes ?? null,
    preferredTherapistId,
  });

  if (!result.success) {
    // The purchase itself is paid and safe either way -- only session 1's
    // booking failed (e.g. lost a claim race, though nothing else could
    // have claimed sessions_used yet on a brand-new purchase). Tell the
    // patient their payment succeeded and they can schedule from the
    // dashboard instead of implying the payment itself failed.
    return NextResponse.json({
      success: true,
      sessionBooked: false,
      sessionBookingError: result.error,
    });
  }

  return NextResponse.json({ success: true, sessionBooked: true, appointmentId: result.appointmentId });
}
