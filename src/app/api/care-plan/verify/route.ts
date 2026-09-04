import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordPaymentCapture } from "@/lib/recordPaymentCapture";
import { mirrorEnsureEntitlement } from "@/lib/sessionCreditMirror";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";

// Confirming payment for a recommended plan.
//
// The money side is the same as every other verify route in this app --
// signature checked server-side, capture applied through the one idempotent
// `record_payment_capture` -- and the webhook covers the case where this
// never runs because the patient closed the tab.
//
// What is specific here is the last step: the recommendation is marked
// accepted, which closes the thread. From that moment a therapist revising
// their advice opens a NEW plan rather than editing this one, because
// editing it would change the description of something already paid for.
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

  const { data: body, error: parseError } = await parseJsonBody<{
    purchaseId?: string;
    offerKind?: string;
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  }>(request);
  if (parseError) return parseError;

  const { purchaseId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  const offerKind = body.offerKind === "home_visit_package" ? "home_visit_package" : "session_package";

  if (!purchaseId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ error: "Missing payment details" }, { status: 400 });
  }

  const admin = createAdminClient();
  const table =
    offerKind === "session_package" ? "patient_package_purchases" : "home_visit_package_purchases";

  const { data: purchase } = await admin
    .from(table)
    .select("id, patient_id, care_plan_version_id, razorpay_order_id, payment_status, package_id")
    .eq("id", purchaseId)
    .maybeSingle();

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
    crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(razorpay_signature));

  if (!signatureValid) {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 });
  }

  // Validity counts from the moment payment clears, not from when the
  // therapist wrote the plan -- a patient who thought about it for a
  // fortnight should not lose a fortnight of their programme.
  const validityDays = await readValidityDays(admin, offerKind, purchase.package_id);
  const paidAt = new Date();
  const expiresAt = new Date(paidAt.getTime() + validityDays * 86_400_000).toISOString();

  const { error: updateError } = await admin
    .from(table)
    .update({
      payment_status: "paid",
      razorpay_payment_id,
      paid_at: paidAt.toISOString(),
      expires_at: expiresAt,
    })
    .eq("id", purchaseId)
    .neq("payment_status", "paid");

  if (updateError) {
    console.error("Failed to record payment for care plan purchase", purchaseId, updateError);
    return NextResponse.json(
      { error: "Could not record the payment. Please contact us." },
      { status: 500 }
    );
  }

  await recordPaymentCapture(admin, {
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
  });

  // The credits themselves. Idempotent, so a replayed verify grants once --
  // and this is the step that makes "the patient receives exactly the
  // sessions they paid for" true, because the entitlement takes its count
  // from the purchase row, which took it from the package the therapist
  // picked.
  const entitlementId = await mirrorEnsureEntitlement(
    admin,
    offerKind === "session_package"
      ? { packagePurchaseId: purchaseId }
      : { homeVisitPurchaseId: purchaseId }
  );

  // Close the recommendation. Claimed on `status = 'active'` so two
  // concurrent verifies cannot both accept it, and so a plan a therapist
  // withdrew in the meantime is not silently reopened as accepted.
  if (purchase.care_plan_version_id) {
    const { data: version } = await admin
      .from("care_plan_versions")
      .select("id, care_plan_id")
      .eq("id", purchase.care_plan_version_id)
      .maybeSingle();

    if (version) {
      const { error: acceptError } = await admin
        .from("care_plans")
        .update({
          status: "accepted",
          accepted_version_id: version.id,
          accepted_at: paidAt.toISOString(),
          entitlement_id: entitlementId,
          updated_at: paidAt.toISOString(),
        })
        .eq("id", version.care_plan_id)
        .eq("status", "active");
      if (acceptError) {
        // The money and the sessions are both already recorded, so this is
        // a reporting problem rather than a payment one -- loud in the log,
        // invisible to the patient.
        console.error(
          "Care plan paid for but could not be marked accepted",
          version.care_plan_id,
          acceptError.message
        );
      }
    }
  }

  return NextResponse.json({ success: true, purchaseId, entitlementId });
}

/** The package's own validity, falling back to the site-wide default. */
async function readValidityDays(
  admin: ReturnType<typeof createAdminClient>,
  offerKind: "session_package" | "home_visit_package",
  packageId: string
): Promise<number> {
  const isOnline = offerKind === "session_package";
  const [{ data: pkg }, { data: settings }] = await Promise.all([
    admin
      .from(isOnline ? "treatment_category_packages" : "home_visit_packages")
      .select("validity_days")
      .eq("id", packageId)
      .maybeSingle(),
    admin
      .from("site_settings")
      .select("package_default_validity_days, home_visit_default_validity_days")
      .maybeSingle(),
  ]);
  const fallback = isOnline
    ? settings?.package_default_validity_days ?? DEFAULT_ADMIN_SETTINGS.packageDefaultValidityDays
    : settings?.home_visit_default_validity_days ??
      DEFAULT_ADMIN_SETTINGS.homeVisitDefaultValidityDays;
  return pkg?.validity_days ?? fallback;
}
