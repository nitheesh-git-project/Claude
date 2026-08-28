import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordPaymentCapture } from "@/lib/recordPaymentCapture";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";
import { bookHomeVisitSession } from "@/lib/bookHomeVisitSession";
import { normalizePincode } from "@/lib/homeVisitAreas";
import type { HomeVisitAddressPayload } from "@/app/api/home-visit/create-order/route";

const MAX_NOTES_LENGTH = 1000;

export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{
    homeVisitPurchaseId?: string;
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
    slotDateTime?: string;
    timezone?: string;
    notes?: string;
    concern?: string;
    address?: HomeVisitAddressPayload & { id?: string | null };
  }>(request);
  if (parseError) return parseError;

  const {
    homeVisitPurchaseId,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    slotDateTime,
    timezone,
    notes,
    concern,
    address,
  } = body;

  if (
    !homeVisitPurchaseId ||
    !razorpay_order_id ||
    !razorpay_payment_id ||
    !razorpay_signature
  ) {
    return NextResponse.json({ error: "Missing payment details" }, { status: 400 });
  }
  if (notes && notes.length > MAX_NOTES_LENGTH) {
    return NextResponse.json(
      { error: `Notes must be ${MAX_NOTES_LENGTH} characters or less.` },
      { status: 400 }
    );
  }

  // Same "future, parseable" bar as the package flow's own pre-check. The
  // home-visit lead time itself is enforced by the wizard's slot step before
  // checkout ever opens, exactly as the 12-hour online lead time is.
  if (slotDateTime !== undefined) {
    const slotTimestamp = new Date(slotDateTime).getTime();
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
    .from("home_visit_package_purchases")
    .select(
      "id, patient_id, package_id, visit_count, visits_used, amount_paid_paise, travel_fee_paise, payment_mode, payment_status, status, locked_therapist_id, default_address_id, razorpay_order_id"
    )
    .eq("id", homeVisitPurchaseId)
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
    crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(razorpay_signature));

  if (!signatureValid) {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 });
  }

  // Validity counts from when payment actually clears, not from when
  // checkout began -- an abandoned order never reaches here, so it never
  // eats into anyone's window. Same fallback chain as the online packages.
  const [{ data: packageRow }, { data: settingsRow }] = await Promise.all([
    admin
      .from("home_visit_packages")
      .select("validity_days, visit_duration_minutes")
      .eq("id", purchase.package_id)
      .maybeSingle(),
    admin
      .from("site_settings")
      .select("home_visit_default_validity_days, home_visit_travel_buffer_minutes")
      .maybeSingle(),
  ]);

  const validityDays =
    packageRow?.validity_days ??
    settingsRow?.home_visit_default_validity_days ??
    DEFAULT_ADMIN_SETTINGS.homeVisitDefaultValidityDays;
  const travelBufferMinutes =
    settingsRow?.home_visit_travel_buffer_minutes ??
    DEFAULT_ADMIN_SETTINGS.homeVisitTravelBufferMinutes;

  const paidAt = new Date();
  const expiresAt = new Date(paidAt.getTime() + validityDays * 86_400_000).toISOString();

  const { error: updateError } = await admin
    .from("home_visit_package_purchases")
    .update({
      payment_status: "paid",
      razorpay_payment_id,
      paid_at: paidAt.toISOString(),
      expires_at: expiresAt,
    })
    .eq("id", homeVisitPurchaseId);

  if (updateError) {
    console.error(
      "Failed to record payment for home visit purchase",
      homeVisitPurchaseId,
      updateError
    );
    return NextResponse.json(
      { error: "Could not record the payment. Please contact us." },
      { status: 500 }
    );
  }

  // Record the money itself, in the one place that holds every payment
  // regardless of what it bought. Idempotent: if the webhook already
  // handled this capture, this finds it captured and changes nothing.
  // Best-effort and after the write above -- the patient has already been
  // charged by this point, so a failure here is a server-log problem, not
  // something to report back as a failed payment.
  //
  // amount_paid_paise deliberately excludes the travel fee (a pass-through
  // reimbursement, never revenue), so the amount actually captured by
  // Razorpay is larger. Passing null lets the database keep whatever the
  // order was minted for rather than writing the smaller figure over it.
  await recordPaymentCapture(admin, {
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
  });

  try {
    await admin.from("home_visit_purchase_events").insert({
      purchase_id: homeVisitPurchaseId,
      event_type: "purchased",
      actor_id: user.id,
      detail: {
        amountPaidPaise: purchase.amount_paid_paise,
        travelFeePaise: purchase.travel_fee_paise,
        expiresAt,
      },
    });
  } catch (eventError) {
    console.error(
      "Failed to log purchased event for home visit purchase",
      homeVisitPurchaseId,
      eventError
    );
  }

  if (!slotDateTime) {
    return NextResponse.json({ success: true, visitBooked: false });
  }

  // The address is re-read from the saved row where possible rather than
  // trusted wholesale from this request body: create-order already wrote
  // it, and that copy went through the serviceability check this one
  // didn't.
  let addressForBooking = address;
  const savedAddressId = address?.id ?? purchase.default_address_id;
  if (savedAddressId) {
    const { data: saved } = await admin
      .from("patient_addresses")
      .select(
        "id, label, line1, line2, landmark, city, state, pincode, area_id, latitude, longitude, map_place_id, contact_phone, access_notes"
      )
      .eq("id", savedAddressId)
      .eq("patient_id", user.id)
      .maybeSingle();
    if (saved) {
      addressForBooking = {
        ...saved,
        mapPlaceId: saved.map_place_id,
        contactPhone: saved.contact_phone,
        accessNotes: saved.access_notes,
      } as HomeVisitAddressPayload & { id?: string | null };
    }
  }

  if (!addressForBooking?.line1 || !addressForBooking?.pincode) {
    // Payment is recorded and safe; only the visit could not be scheduled.
    return NextResponse.json({
      success: true,
      visitBooked: false,
      visitBookingError:
        "Your payment went through, but we couldn't read the address. Schedule your visit from your dashboard.",
    });
  }

  const result = await bookHomeVisitSession(admin, {
    purchase: { ...purchase, payment_status: "paid", expires_at: expiresAt },
    slotDateTime,
    timezone,
    notes,
    concern,
    actorId: user.id,
    visitDurationMinutes: packageRow?.visit_duration_minutes ?? null,
    travelBufferMinutes,
    address: {
      id: savedAddressId ?? null,
      label: addressForBooking.label ?? null,
      line1: addressForBooking.line1,
      line2: addressForBooking.line2 ?? null,
      landmark: addressForBooking.landmark ?? null,
      city: addressForBooking.city ?? null,
      state: addressForBooking.state ?? null,
      pincode: normalizePincode(addressForBooking.pincode),
      latitude: addressForBooking.latitude ?? null,
      longitude: addressForBooking.longitude ?? null,
      map_place_id: addressForBooking.mapPlaceId ?? null,
      contact_phone: addressForBooking.contactPhone ?? null,
      access_notes: addressForBooking.accessNotes ?? null,
      area_id:
        (addressForBooking as { area_id?: string | null }).area_id ?? null,
    },
  });

  if (!result.success) {
    // The purchase itself is paid and safe -- only visit 1's booking
    // failed. Say so plainly rather than implying the payment failed.
    return NextResponse.json({
      success: true,
      visitBooked: false,
      visitBookingError: result.error,
    });
  }

  return NextResponse.json({
    success: true,
    visitBooked: true,
    appointmentId: result.appointmentId,
  });
}
