import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { normalizePincode, isValidPincodeShape } from "@/lib/homeVisitAreas";
import { computeHomeVisitTotal } from "@/lib/homeVisitPricing";
import { isProfileActive, isPatientProfile } from "@/lib/supabase/requireActiveProfile";

export type HomeVisitAddressPayload = {
  label?: string | null;
  line1?: string;
  line2?: string | null;
  landmark?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string;
  latitude?: number | null;
  longitude?: number | null;
  mapPlaceId?: string | null;
  contactPhone?: string | null;
  accessNotes?: string | null;
  saveToAddressBook?: boolean;
};

const MAX_LINE_LENGTH = 300;
const MAX_NOTES_LENGTH = 1000;

// Creates the home_visit_package_purchases row and the Razorpay order
// together, entirely server-side, the moment checkout starts -- same shape
// and same reasoning as /api/packages/create-order: a purchase only ever
// makes sense already-paid, so there is no meaningful client-owned "unpaid
// draft" state for one.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{
    packageId?: string;
    address?: HomeVisitAddressPayload;
  }>(request);
  if (parseError) return parseError;

  const { packageId, address } = body;
  if (!packageId) {
    return NextResponse.json({ error: "Missing packageId" }, { status: 400 });
  }
  if (!address?.line1?.trim()) {
    return NextResponse.json({ error: "A street address is required." }, { status: 400 });
  }
  if (address.line1.length > MAX_LINE_LENGTH) {
    return NextResponse.json({ error: "That address line is too long." }, { status: 400 });
  }
  if (address.accessNotes && address.accessNotes.length > MAX_NOTES_LENGTH) {
    return NextResponse.json({ error: "Access notes are too long." }, { status: 400 });
  }

  const pincode = normalizePincode(address.pincode);
  if (!isValidPincodeShape(pincode)) {
    return NextResponse.json({ error: "Enter a valid 6-digit pincode." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Deliberately isProfileActive, NOT isProfileActiveAndApproved.
  //
  // Self-signup patients start approved = false, so requiring approval here
  // would mean nobody could ever buy a home visit on the same visit they
  // discovered it -- they would sign up, be told to wait for a human, and
  // in practice not come back. For this product that gate buys nothing: a
  // completed Razorpay payment against an address inside a serviceable
  // pincode is itself the vetting `approved` exists to provide, and an
  // admin still assigns a therapist before anyone actually travels.
  //
  // There is precedent: /api/patient/register-via-referral sets
  // approved = true outright, because the admin vetted that patient by
  // another route. This is the same judgement applied to payment.
  //
  // `active` is still enforced, so a suspended account cannot buy its way
  // back in, and nothing else is relaxed -- the RLS clamp still keeps every
  // home-visit appointment insert server-side, and bookHomeVisitSession()
  // still never auto-confirms without a genuinely free locked therapist.
  if (!(await isProfileActive(user.id))) {
    return NextResponse.json(
      { error: "Your account has been suspended." },
      { status: 403 }
    );
  }

  // Sessions are delivered to patients, and one account carries one role --
  // see isPatientProfile. The wizard says so; this is the same check for a
  // session cookie calling the route directly.
  if (!(await isPatientProfile(user.id))) {
    return NextResponse.json(
      { error: "This account can't book sessions. Sessions are booked under a patient account." },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  const [{ data: pkg }, { data: settingsRow }, { data: area }] = await Promise.all([
    admin
      .from("home_visit_packages")
      .select("id, title, visit_count, price_paise, travel_fee_included, validity_days, active")
      .eq("id", packageId)
      .single(),
    admin.from("site_settings").select("home_visit_enabled").maybeSingle(),
    admin
      .from("home_visit_areas")
      .select("id, travel_fee_paise, active")
      .eq("pincode", pincode)
      .eq("active", true)
      .maybeSingle(),
  ]);

  if (settingsRow?.home_visit_enabled !== true) {
    return NextResponse.json(
      { error: "Home visits aren't available right now." },
      { status: 403 }
    );
  }
  if (!pkg || !pkg.active) {
    return NextResponse.json({ error: "That package isn't available." }, { status: 400 });
  }

  // Re-checked here rather than trusted from the wizard's earlier
  // check-area answer. The areas list is admin-editable and can change
  // between step 1 and checkout, and this is the last point before money
  // changes hands -- taking payment for a visit nobody can travel to is
  // the one failure this whole serviceability layer exists to prevent.
  if (!area) {
    return NextResponse.json(
      { error: "We don't currently visit that pincode. Please check it and try again." },
      { status: 400 }
    );
  }

  // The amount is resolved entirely here, from the package's own price and
  // the area's own travel fee. The browser sends a package id and an
  // address -- never an amount.
  const total = computeHomeVisitTotal({
    packagePricePaise: pkg.price_paise,
    travelFeePaise: area.travel_fee_paise,
    travelIncluded: pkg.travel_fee_included,
    visitCount: pkg.visit_count,
  });

  // Optionally remember the address for next time. Best-effort: a failure
  // here must not stop the purchase, since the appointment carries its own
  // snapshot of the address regardless.
  let addressId: string | null = null;
  if (address.saveToAddressBook !== false) {
    const { data: saved } = await admin
      .from("patient_addresses")
      .insert({
        patient_id: user.id,
        label: address.label?.trim() || null,
        line1: address.line1.trim(),
        line2: address.line2?.trim() || null,
        landmark: address.landmark?.trim() || null,
        city: address.city?.trim() || null,
        state: address.state?.trim() || null,
        pincode,
        area_id: area.id,
        latitude: address.latitude ?? null,
        longitude: address.longitude ?? null,
        map_place_id: address.mapPlaceId?.trim() || null,
        contact_phone: address.contactPhone?.trim() || null,
        access_notes: address.accessNotes?.trim() || null,
      })
      .select("id")
      .maybeSingle();
    addressId = saved?.id ?? null;
  }

  const { data: purchase, error: insertError } = await admin
    .from("home_visit_package_purchases")
    .insert({
      patient_id: user.id,
      package_id: pkg.id,
      visit_count: pkg.visit_count,
      amount_paid_paise: pkg.price_paise,
      travel_fee_paise: area.travel_fee_paise,
      payment_mode: "prepaid",
      default_address_id: addressId,
    })
    .select("id")
    .single();

  if (insertError || !purchase) {
    console.error("Failed to create home visit purchase row", insertError);
    return NextResponse.json(
      { error: "Could not start payment. Please try again." },
      { status: 500 }
    );
  }

  // The Razorpay SDK throws synchronously in its constructor when key_id is
  // missing -- unguarded, that crashes the route with an empty-body 500
  // instead of a message pointing at the actual cause (a missing/wrong
  // NEXT_PUBLIC_RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET for this deployment).
  let razorpay: Razorpay;
  try {
    razorpay = new Razorpay({
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });
  } catch (err) {
    console.error("Razorpay client construction failed -- check env vars", err);
    return NextResponse.json(
      { error: "Payments are temporarily unavailable. Please try again shortly or contact us." },
      { status: 500 }
    );
  }

  let order;
  try {
    order = await razorpay.orders.create({
      amount: total.totalPaise,
      currency: "INR",
      receipt: purchase.id,
    });
  } catch (err) {
    console.error("Razorpay order creation failed for home visit purchase", purchase.id, err);
    return NextResponse.json(
      { error: "Could not start payment. Please try again." },
      { status: 500 }
    );
  }

  // Written before checkout opens because /verify matches on it -- a
  // failure to store it would leave a paid order with nothing to verify
  // against, so this is a hard failure rather than a best-effort write.
  const { error: orderIdError } = await admin
    .from("home_visit_package_purchases")
    .update({ razorpay_order_id: order.id })
    .eq("id", purchase.id);

  if (orderIdError) {
    console.error("Failed to store razorpay_order_id for home visit purchase", purchase.id, orderIdError);
    return NextResponse.json(
      { error: "Could not start payment. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    homeVisitPurchaseId: purchase.id,
    addressId,
    packageTitle: pkg.title,
    breakdown: {
      packagePricePaise: total.packagePricePaise,
      travelFeePaise: total.travelFeePaise,
      totalPaise: total.totalPaise,
      travelLabel: total.travelLabel,
    },
  });
}
