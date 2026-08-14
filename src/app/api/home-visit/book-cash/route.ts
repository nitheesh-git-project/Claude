import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { normalizePincode, isValidPincodeShape } from "@/lib/homeVisitAreas";
import { isProfileActive } from "@/lib/supabase/requireActiveProfile";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";
import { bookHomeVisitSession } from "@/lib/bookHomeVisitSession";
import type { HomeVisitAddressPayload } from "@/app/api/home-visit/create-order/route";

const MAX_LINE_LENGTH = 300;
const MAX_NOTES_LENGTH = 1000;

// Books a home visit paid for at the door instead of online. One step, not
// two: the prepaid flow needs a create-order/verify pair because a real
// payment gateway round-trip sits in between, but nothing external happens
// here, so the purchase, the address and the visit itself are all created
// in this single request.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{
    packageId?: string;
    address?: HomeVisitAddressPayload;
    slotDateTime?: string;
    timezone?: string;
    notes?: string;
    concern?: string;
  }>(request);
  if (parseError) return parseError;

  const { packageId, address, slotDateTime, timezone, notes, concern } = body;
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
  if (notes && notes.length > MAX_NOTES_LENGTH) {
    return NextResponse.json(
      { error: `Notes must be ${MAX_NOTES_LENGTH} characters or less.` },
      { status: 400 }
    );
  }
  if (!slotDateTime) {
    return NextResponse.json({ error: "Missing slotDateTime" }, { status: 400 });
  }
  const slotTimestamp = new Date(slotDateTime).getTime();
  if (Number.isNaN(slotTimestamp)) {
    return NextResponse.json({ error: "Invalid slotDateTime" }, { status: 400 });
  }
  if (slotTimestamp <= Date.now()) {
    return NextResponse.json({ error: "The slot must be in the future" }, { status: 400 });
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

  // Same isProfileActive-not-Approved judgement as /api/home-visit/create-order
  // -- see that route's comment. Nothing here is any less true for a cash
  // booking: the address and the admin's later assignment are still the
  // real vetting, and requiring approval first would just lose the patient.
  if (!(await isProfileActive(user.id))) {
    return NextResponse.json({ error: "Your account has been suspended." }, { status: 403 });
  }

  const admin = createAdminClient();
  const [{ data: pkg }, { data: settingsRow }, { data: area }] = await Promise.all([
    admin
      .from("home_visit_packages")
      .select("id, title, visit_count, price_paise, travel_fee_included, validity_days, visit_duration_minutes, therapist_locked, active")
      .eq("id", packageId)
      .single(),
    admin
      .from("site_settings")
      .select(
        "home_visit_enabled, home_visit_cash_enabled, home_visit_default_validity_days, home_visit_travel_buffer_minutes"
      )
      .maybeSingle(),
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
  // Defaults to true (DEFAULT_ADMIN_SETTINGS.homeVisitCashEnabled) -- only
  // an explicit false turns it off, same convention as every other toggle
  // parsed by parseAdminSettings.
  if (settingsRow?.home_visit_cash_enabled === false) {
    return NextResponse.json(
      { error: "Paying at the door isn't available right now — please pay online instead." },
      { status: 403 }
    );
  }
  if (!pkg || !pkg.active) {
    return NextResponse.json({ error: "That package isn't available." }, { status: 400 });
  }
  if (!area) {
    return NextResponse.json(
      { error: "We don't currently visit that pincode. Please check it and try again." },
      { status: 400 }
    );
  }

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

  const validityDays =
    pkg.validity_days ??
    settingsRow?.home_visit_default_validity_days ??
    DEFAULT_ADMIN_SETTINGS.homeVisitDefaultValidityDays;
  const expiresAt = new Date(Date.now() + validityDays * 86_400_000).toISOString();
  const travelBufferMinutes =
    settingsRow?.home_visit_travel_buffer_minutes ??
    DEFAULT_ADMIN_SETTINGS.homeVisitTravelBufferMinutes;

  const { data: purchase, error: insertError } = await admin
    .from("home_visit_package_purchases")
    .insert({
      patient_id: user.id,
      package_id: pkg.id,
      visit_count: pkg.visit_count,
      // Stored as the reference price even though nothing has been charged
      // -- bookHomeVisitSession() always reads amount_paid_paise to derive
      // the per-visit fee, for both payment modes. payment_status stays the
      // column default ('unpaid'), which is what actually marks this as
      // money not yet received.
      amount_paid_paise: pkg.price_paise,
      travel_fee_paise: area.travel_fee_paise,
      payment_mode: "cash_on_visit",
      default_address_id: addressId,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (insertError || !purchase) {
    console.error("Failed to create cash home visit purchase row", insertError);
    return NextResponse.json(
      { error: "Could not book this visit. Please try again." },
      { status: 500 }
    );
  }

  try {
    await admin.from("home_visit_purchase_events").insert({
      purchase_id: purchase.id,
      event_type: "purchased",
      actor_id: user.id,
      detail: { paymentMode: "cash_on_visit", travelFeePaise: area.travel_fee_paise, expiresAt },
    });
  } catch (eventError) {
    console.error("Failed to log purchased event for cash home visit purchase", purchase.id, eventError);
  }

  const result = await bookHomeVisitSession(admin, {
    purchase: {
      id: purchase.id,
      patient_id: user.id,
      visit_count: pkg.visit_count,
      visits_used: 0,
      amount_paid_paise: pkg.price_paise,
      travel_fee_paise: area.travel_fee_paise,
      payment_mode: "cash_on_visit",
      payment_status: "unpaid",
      status: "active",
      expires_at: expiresAt,
      locked_therapist_id: null,
    },
    slotDateTime,
    timezone,
    notes,
    concern,
    actorId: user.id,
    visitDurationMinutes: pkg.visit_duration_minutes,
    travelBufferMinutes,
    address: {
      id: addressId,
      label: address.label ?? null,
      line1: address.line1.trim(),
      line2: address.line2 ?? null,
      landmark: address.landmark ?? null,
      city: address.city ?? null,
      state: address.state ?? null,
      pincode,
      latitude: address.latitude ?? null,
      longitude: address.longitude ?? null,
      map_place_id: address.mapPlaceId ?? null,
      contact_phone: address.contactPhone ?? null,
      access_notes: address.accessNotes ?? null,
      area_id: area.id,
    },
  });

  if (!result.success) {
    // The purchase exists either way (nothing was charged, so there is
    // nothing to roll back financially) -- only the visit itself could not
    // be scheduled. Say so rather than implying the whole booking failed.
    return NextResponse.json({
      success: true,
      visitBooked: false,
      homeVisitPurchaseId: purchase.id,
      visitBookingError: result.error,
    });
  }

  return NextResponse.json({
    success: true,
    visitBooked: true,
    homeVisitPurchaseId: purchase.id,
    appointmentId: result.appointmentId,
  });
}
