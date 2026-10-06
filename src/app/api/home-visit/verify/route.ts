import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordPaymentCapture } from "@/lib/recordPaymentCapture";
import { mirrorEnsureEntitlement } from "@/lib/sessionCreditMirror";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";
import { bookHomeVisitSession } from "@/lib/bookHomeVisitSession";
import { normalizePincode } from "@/lib/homeVisitAreas";
import type { HomeVisitAddressPayload } from "@/app/api/home-visit/create-order/route";
import { isWholeHourSlot, NOT_WHOLE_HOUR_ERROR, resolveSlotInstant } from "@/lib/bookingSlots";
import {
  approvePatientAfterPayment,
  isProfileActive,
  profileCheckUnavailable,
} from "@/lib/supabase/requireActiveProfile";

const MAX_NOTES_LENGTH = 1000;

/**
 * Thrown to skip the `purchased` event insert when one already exists. A
 * sentinel rather than an early return because the insert sits inside a
 * best-effort try/catch, and a plain `return` there would leave the route.
 */
class AlreadyLogged extends Error {}

/**
 * **This route deliberately does not re-read `home_visit_enabled`.**
 *
 * `create-order` checks it, and an admin can switch the service off in the
 * seconds between that and the patient coming back from Razorpay. Refusing
 * here would mean the gateway has the money and the patient has nothing --
 * so the only honest refusal is a refund, which is a decision a person takes
 * per purchase on the screen that already does refunds, not a check a route
 * makes on their behalf.
 *
 * It is the same rule `book-visits` follows for serviceability, stated for
 * the same reason: the behaviour was already right and right *by omission*,
 * which is the shape where the next reader adds the check and strands a
 * booking somebody has paid for. The switch gates what can be **sold**.
 * What it does not cancel is now said out loud on the switch itself --
 * `readHomeVisitCommitmentTotal` counts the paid visits still to deliver and
 * Settings -> Programmes & Home Visits asks before it goes off.
 */
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

  // `approved` / `active` are enforced in two places, and both have to
  // stay: src/proxy.ts for dashboard navigation, and here, because a valid
  // session cookie reaches this route without passing the proxy at all.
  // This route had only the first.
  const activeStanding = await isProfileActive(user.id);
  if (activeStanding === null) return profileCheckUnavailable();
  if (!activeStanding) {
    return NextResponse.json({ error: "Your account is not active." }, { status: 403 });
  }

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
    timezone,
    notes,
    concern,
    address,
  } = body;
  // A zone-less wall time is read in the booking's zone, never the server's.
  const slotDateTime =
    body.slotDateTime === undefined
      ? undefined
      : resolveSlotInstant(body.slotDateTime, timezone) ?? "invalid";

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
    // Slots start on the hour, everywhere -- checked in the zone the visit
    // is being booked in, since 6 PM IST is 12:30 UTC.
    if (!isWholeHourSlot(slotDateTime, body.timezone)) {
      return NextResponse.json({ error: NOT_WHOLE_HOUR_ERROR }, { status: 400 });
    }
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
  // A verified payment unlocks a new patient's account, the same as the
  // online twin -- a home visit used to leave them on /pending-approval
  // after paying.
  await approvePatientAfterPayment(user.id);

  // Same as the online twin: the entitlement has to exist before visit 1 is
  // booked below, or its reserve has nothing to hold it.
  await mirrorEnsureEntitlement(admin, { homeVisitPurchaseId });

  try {
    // Idempotent for the same reason the booking below now is: a retried
    // verify wrote a second `purchased` event, and two of them on one
    // purchase read as two purchases on the timeline an admin opens to work
    // out what happened. Keyed on the thing that happened rather than on who
    // got here first, the rule the credit ledger's own keys follow.
    const { data: alreadyLogged } = await admin
      .from("home_visit_purchase_events")
      .select("id")
      .eq("purchase_id", homeVisitPurchaseId)
      .eq("event_type", "purchased")
      .limit(1)
      .maybeSingle();
    if (alreadyLogged) throw new AlreadyLogged();
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
    if (!(eventError instanceof AlreadyLogged)) {
      console.error(
        "Failed to log purchased event for home visit purchase",
        homeVisitPurchaseId,
        eventError
      );
    }
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

  // A retried verify -- a double-tapped Pay, a resent browser callback,
  // Razorpay's own at-least-once delivery racing the webhook -- is refused by
  // the one-per-purchase-per-slot index, which means the visit it asked for
  // already exists. That is this call succeeding twice, not failing, and the
  // claimed credit was given back inside the helper, so the balance is right.
  // Reporting it as an error would tell a patient whose money has moved that
  // their visit was not booked, which is the one thing this route must never
  // say wrongly.
  if (!result.success && result.duplicate) {
    return NextResponse.json({ success: true, visitBooked: true, alreadyBooked: true });
  }

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
