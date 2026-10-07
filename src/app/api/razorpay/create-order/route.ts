import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  readPatientCheckoutStanding,
  profileCheckUnavailable,
} from "@/lib/supabase/requireActiveProfile";
import { mintAppointmentOrder } from "@/lib/appointmentOrderServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { pricingForRequest } from "@/lib/countryPricingServer";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { parseJsonBody } from "@/lib/parseJsonBody";

// The amount is always resolved here, server-side, from the appointment's
// linked category price (or the flat base fee) - never trust an amount
// sent from the browser, or anyone could pay whatever they want.

export async function POST(request: NextRequest) {

  // Who is asking, before anything the caller sent is looked at. An
  // anonymous request is refused here rather than after body validation,
  // so an unauthenticated caller never drives this route's parsing and is
  // never told what shape the request should have been.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Keyed on the account, which is the one identifier the person being
  // limited cannot change -- an IP can be rotated, and this is the limit
  // standing in front of money. It falls back to the IP for an anonymous
  // caller, which `/api/appointments/quote` and the promo preview both
  // answer on purpose (a self-signup patient has no account at step 3).
  // Placed after the session is read rather than at the top of the handler
  // for that reason, and still before the body is parsed.
  const limited = await enforceRateLimit(request, "checkout", {
    identifier: user?.id ?? null,
  });
  if (limited) return limited;

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { data: body, error: parseError } = await parseJsonBody<{
    appointmentId?: string;
    promoCode?: string;
  }>(request);
  if (parseError) return parseError;
  const { appointmentId, promoCode } = body;
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }
  // An identifier, never an amount. What the code is worth is read from the
  // row an admin created, server-side, below.
  const typedPromoCode = typeof promoCode === "string" ? promoCode : "";

  // Deliberately isProfileActive, not isProfileActiveAndApproved:
  // appointments_insert_own already lets an unapproved patient's
  // pre-payment appointment row through, and reaching this route at all
  // means they're genuinely trying to pay for it -- gating checkout itself
  // on approval would mean that attempt can never happen. See
  // approvePatientAfterPayment: the account is unlocked by a captured
  // payment, or by /api/patient/payment-try once enough tries have failed --
  // no longer by reaching this route.
  // The standing check and the appointment read are independent, so they go
  // out together -- this route sits between the tap on Pay and the Razorpay
  // sheet. The appointment read is RLS-scoped and filtered to this caller, so
  // starting it before the standing answer reveals nothing; the standing is
  // still checked first, and refuses before the row is looked at.
  const [standing, { data: appointment }] = await Promise.all([
    readPatientCheckoutStanding(user.id),
    supabase
      .from("appointments")
      .select(
        "id, patient_id, payment_status, payment_terms, category_id, razorpay_order_id, therapist_id, status, slot_time, duration_minutes, timezone, visit_mode, travel_fee_paise"
      )
      .eq("id", appointmentId)
      .eq("patient_id", user.id)
      .single(),
  ]);
  if (standing === "unavailable") return profileCheckUnavailable();
  if (standing === "suspended") {
    return NextResponse.json({ error: "Your account has been suspended." }, { status: 403 });
  }
  if (standing === "not_patient") {
    return NextResponse.json(
      { error: "This account can't book sessions. Sessions are booked under a patient account." },
      { status: 403 }
    );
  }

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  if (appointment.payment_status === "paid") {
    return NextResponse.json({ error: "This booking is already paid" }, { status: 400 });
  }

  // A session already confirmed on pay-later terms is not an open checkout.
  // Paying for it here would mark it paid outside the settlement path,
  // skipping the allocation that decides which delivered sessions a payment
  // covers -- so the money would land with nothing saying what it was for.
  // Choosing to pay now is offered BEFORE the booking is confirmed, where it
  // produces an ordinary prepaid session; after that, settling is its own
  // flow.
  if (appointment.payment_terms === "pay_later") {
    return NextResponse.json(
      {
        error:
          "This session is already booked, and you'll settle it later. You can pay from your dashboard.",
      },
      { status: 409 }
    );
  }

  // Everything from here on is shared with /api/appointments/create, which
  // mints the order for a booking it has just made in the same request (one
  // round trip from the Pay tap to the Razorpay sheet instead of two). One
  // function, so the two doors cannot grow different rules about prior
  // orders, claims, free bookings or what is written back.
  // Priced for the request's own country, re-derived here rather than taken
  // from anything the wizard sent.
  const { pricing } = await pricingForRequest(createAdminClient(), request);
  const minted = await mintAppointmentOrder({
    supabase,
    appointment,
    appointmentId,
    promoCode: typedPromoCode,
    pricing,
  });
  return NextResponse.json(minted.body, { status: minted.status });
}
