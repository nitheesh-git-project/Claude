import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import {
  isProfileActive,
  isPatientProfile,
} from "@/lib/supabase/requireActiveProfile";
import { resolveRecommendablePackage } from "@/lib/carePlanServer";
import { parseOfferSnapshot, carePlanState } from "@/lib/carePlans";

// Buying the plan a therapist recommended.
//
// The patient sends one thing: which recommendation they are accepting.
// Everything else -- what it costs, how many sessions it is, how long it
// lasts -- is re-derived here from the catalog row the version names. A
// body that carried a price or a session count would be a body worth
// tampering with, so it carries neither.
//
// The purchase row itself is an ordinary `patient_package_purchases` /
// `home_visit_package_purchases` row with `care_plan_version_id` set. That
// is deliberate: every piece of machinery that already works on a purchase
// -- the entitlement backfill, booking, the therapist lock, expiry,
// refunds, the ledger mirror -- keeps working unchanged, and the only new
// thing is the link back to the recommendation it came from.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{
    carePlanVersionId?: string;
  }>(request);
  if (parseError) return parseError;

  const carePlanVersionId = body.carePlanVersionId?.trim();
  if (!carePlanVersionId) {
    return NextResponse.json({ error: "Missing carePlanVersionId" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  // Same gate as the other purchase-start routes: a completed,
  // signature-verified payment is itself the vetting `approved` provides,
  // and a patient who has just been seen by a therapist is by definition
  // not a fake signup.
  if (!(await isProfileActive(user.id))) {
    return NextResponse.json(
      { error: "Your account is not active — it may have been suspended." },
      { status: 403 }
    );
  }
  if (!(await isPatientProfile(user.id))) {
    return NextResponse.json(
      { error: "This account can't buy sessions. Sessions are bought under a patient account." },
      { status: 403 }
    );
  }

  const admin = createAdminClient();

  const { data: version } = await admin
    .from("care_plan_versions")
    .select(
      "id, care_plan_id, offer_kind, session_package_id, home_visit_package_id, offer_snapshot, is_current, expires_at"
    )
    .eq("id", carePlanVersionId)
    .maybeSingle();

  if (!version) {
    return NextResponse.json({ error: "That recommendation no longer exists." }, { status: 404 });
  }

  const { data: plan } = await admin
    .from("care_plans")
    .select("id, patient_id, therapist_id, status")
    .eq("id", version.care_plan_id)
    .maybeSingle();

  if (!plan || plan.patient_id !== user.id) {
    return NextResponse.json({ error: "That recommendation isn't yours." }, { status: 403 });
  }

  // Only the version the therapist currently stands behind is purchasable.
  // An older one is what they used to think.
  if (!version.is_current) {
    return NextResponse.json(
      {
        error:
          "Your therapist has updated this recommendation. Refresh to see the current one.",
      },
      { status: 409 }
    );
  }

  const state = carePlanState(
    { status: plan.status as never },
    { expires_at: version.expires_at },
    Date.now()
  );
  if (state === "accepted") {
    return NextResponse.json(
      { error: "You've already bought this plan." },
      { status: 409 }
    );
  }
  if (state !== "awaiting_patient") {
    return NextResponse.json(
      {
        error:
          state === "lapsed"
            ? "This recommendation has expired. Ask your therapist to send a fresh one."
            : "This recommendation is no longer open.",
      },
      { status: 409 }
    );
  }

  const packageId = version.session_package_id ?? version.home_visit_package_id;
  if (!packageId) {
    return NextResponse.json({ error: "That recommendation is incomplete." }, { status: 400 });
  }

  const offerKind = version.offer_kind as "session_package" | "home_visit_package";
  const live = await resolveRecommendablePackage(admin, offerKind, packageId);
  if (!live) {
    return NextResponse.json(
      {
        error:
          "The programme your therapist recommended is no longer available. They'll need to send a new recommendation.",
      },
      { status: 409 }
    );
  }

  // The snapshot is what the patient was shown; the live row is what they
  // would be charged. If those have parted company since the therapist
  // wrote the plan, nobody is charged a different amount quietly -- the
  // recommendation goes back to the clinician to re-confirm.
  const snapshot = parseOfferSnapshot(version.offer_snapshot);
  if (
    snapshot &&
    (snapshot.pricePaise !== live.snapshot.pricePaise ||
      snapshot.sessionCount !== live.snapshot.sessionCount)
  ) {
    return NextResponse.json(
      {
        error:
          "This programme has changed since your therapist recommended it. We've asked them to confirm it before you pay.",
      },
      { status: 409 }
    );
  }

  const amountPaise = live.snapshot.pricePaise;
  if (!amountPaise || amountPaise <= 0) {
    return NextResponse.json({ error: "That programme has no price set." }, { status: 400 });
  }

  const table =
    offerKind === "session_package"
      ? "patient_package_purchases"
      : "home_visit_package_purchases";

  // Idempotency before the order is minted: the unique index on
  // care_plan_version_id means a second Accept finds the first purchase
  // rather than creating a parallel one. A purchase that is still unpaid is
  // reused, so a patient who abandoned checkout and came back does not
  // accumulate orders.
  const { data: existingPurchase } = await admin
    .from(table)
    .select("id, payment_status, razorpay_order_id")
    .eq("care_plan_version_id", carePlanVersionId)
    .maybeSingle();

  if (existingPurchase?.payment_status === "paid") {
    return NextResponse.json({ error: "You've already bought this plan." }, { status: 409 });
  }

  let purchaseId = existingPurchase?.id ?? null;

  if (!purchaseId) {
    // Continuity: the therapist who recommended it is the one who delivers
    // it, which is the point of recommending after seeing someone.
    const lockedTherapistId = live.snapshot.therapistLocked ? plan.therapist_id : null;

    // The two branches are written out rather than unioned into one object:
    // the tables genuinely have different columns (session_count vs
    // visit_count, and only the online one carries a category), and a union
    // here is a shape the query builder cannot check.
    const created =
      offerKind === "session_package"
        ? await admin
            .from("patient_package_purchases")
            .insert({
              patient_id: user.id,
              package_id: packageId,
              category_id: live.categoryId,
              session_count: live.snapshot.sessionCount,
              amount_paid_paise: amountPaise,
              care_plan_version_id: carePlanVersionId,
              locked_therapist_id: lockedTherapistId,
            })
            .select("id")
            .single()
        : await admin
            .from("home_visit_package_purchases")
            .insert({
              patient_id: user.id,
              package_id: packageId,
              visit_count: live.snapshot.sessionCount,
              amount_paid_paise: amountPaise,
              care_plan_version_id: carePlanVersionId,
              locked_therapist_id: lockedTherapistId,
            })
            .select("id")
            .single();

    if (created.error || !created.data) {
      if (created.error?.code === "23505") {
        return NextResponse.json(
          { error: "This plan is already being paid for. Refresh and try again." },
          { status: 409 }
        );
      }
      console.error(
        "Failed to create a purchase for a care plan",
        carePlanVersionId,
        created.error
      );
      return NextResponse.json(
        { error: "Could not start payment. Please try again." },
        { status: 500 }
      );
    }
    purchaseId = created.data.id;
  }

  let razorpay: Razorpay;
  try {
    razorpay = new Razorpay({
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });
  } catch (err) {
    console.error("Razorpay client construction failed -- check env vars", err);
    return NextResponse.json(
      { error: "Payments are temporarily unavailable. Please try again shortly." },
      { status: 500 }
    );
  }

  let order;
  try {
    order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: purchaseId,
    });
  } catch (err) {
    console.error("Razorpay order creation failed for care plan purchase", purchaseId, err);
    return NextResponse.json(
      { error: "Could not start payment. Please try again." },
      { status: 500 }
    );
  }

  const { error: updateError } = await admin
    .from(table)
    .update({ razorpay_order_id: order.id })
    .eq("id", purchaseId);
  if (updateError) {
    console.error("Failed to save razorpay_order_id for care plan purchase", purchaseId, updateError);
    return NextResponse.json(
      { error: "Could not start payment. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    purchaseId,
    offerKind,
  });
}
