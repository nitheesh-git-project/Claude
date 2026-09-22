import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActive, isPatientProfile } from "@/lib/supabase/requireActiveProfile";
import { resolveCheckoutQuote } from "@/lib/checkoutQuote";
import { isGatewayPayable } from "@/lib/discounts";
import { confirmPayLaterAppointment } from "@/lib/confirmPaidAppointment";
import { readPayLaterBookingEligibility } from "@/lib/payLaterSettingsServer";
import { payLaterRefusalMessage } from "@/lib/payLaterBooking";
import { enforceRateLimit } from "@/lib/rateLimitServer";

// A booking by a patient the clinic has agreed to be paid by afterwards.
//
// The sibling of `/api/appointments/confirm-free`, and deliberately the same
// shape: re-resolve everything server-side, refuse if the state does not
// allow it, then confirm through the sequence the paid path uses. What it
// does NOT do is the point -- no gateway, no `payments` row, no
// `payment_status = 'paid'`, no `paid_at`.
//
// Six rules:
//
// 1. **Eligibility is re-derived here, never sent.** The browser posts an
//    appointment id and nothing else. A request can be crafted, and "the
//    patient said they were allowed to" is not a check.
// 2. **Online sessions only, and never against a programme.** A home visit
//    carries travel, which is a pass-through paid to the therapist in full --
//    deferring it would have them funding their own transport until the
//    patient settled. A programme session is drawn from the credit ledger,
//    which this feature deliberately never touches.
// 3. **Nothing is owed yet.** `amount_due_paise` is stamped now and counted
//    only once the session is `completed`. That one split is what makes
//    "booking owes nothing" and "a late cancellation owes nothing" true with
//    no special case anywhere -- there is no state to unwind, because nothing
//    was ever owed.
// 4. **The price is frozen, because `checkoutQuote` reads the LIVE category
//    price.** Resolve it again at settlement and the patient is charged the
//    new price for work already delivered -- the same reason a purchase reads
//    its frozen `package_snapshot` rather than the live catalogue row.
// 5. **A free booking is not a debt of zero.** If the discounts took the
//    total to nothing there is nothing to settle later, so this hands the
//    caller back to `confirm-free` rather than writing terms nobody owes
//    anything under.
// 6. **It returns the figure it wrote.** The confirmation screen renders
//    this number, never a re-read -- reading the price once to quote and
//    again to render is how the two come to differ.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // The same scope the rest of checkout counts against, keyed on the account
  // rather than the IP -- an IP can be rotated and this is the door in front
  // of a session being delivered without money. Below the session read for
  // exactly that reason, and before anything is written.
  const limited = await enforceRateLimit(request, "checkout", { identifier: user.id });
  if (limited) return limited;

  if (!(await isProfileActive(user.id))) {
    return NextResponse.json({ error: "Your account has been suspended." }, { status: 403 });
  }
  if (!(await isPatientProfile(user.id))) {
    return NextResponse.json(
      { error: "This account can't book sessions. Sessions are booked under a patient account." },
      { status: 403 }
    );
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    appointmentId?: string;
    promoCode?: string | null;
  }>(request);
  if (parseError) return parseError;

  const appointmentId = body.appointmentId?.trim();
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }

  const { data: appointment } = await supabase
    .from("appointments")
    .select(
      "id, patient_id, payment_status, category_id, therapist_id, status, slot_time, duration_minutes, timezone, visit_mode, travel_fee_paise, preferred_therapist_id, package_purchase_id"
    )
    .eq("id", appointmentId)
    .eq("patient_id", user.id)
    .maybeSingle();

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (appointment.payment_status === "paid") {
    // Already settled, or a double tap on a screen they already finished.
    return NextResponse.json({ success: true, alreadyConfirmed: true });
  }

  const admin = createAdminClient();

  const eligibility = await readPayLaterBookingEligibility(admin, {
    patientId: user.id,
    visitMode: appointment.visit_mode,
    hasProgramme: !!appointment.package_purchase_id,
  });
  if (!eligibility.allowed) {
    return NextResponse.json(
      { error: payLaterRefusalMessage(eligibility.reason) },
      { status: 409 }
    );
  }

  // Resolved exactly as every other booking is, through the one module the
  // quote and the order route both read -- so what this patient owes is
  // worked out the same way as what anybody else is charged. `claim: true`
  // because a code really is being spent here: the discount is frozen into
  // the amount below and can never be taken back, so the cap must count it.
  const quote = await resolveCheckoutQuote(admin, {
    appointment,
    promoCode: typeof body.promoCode === "string" ? body.promoCode : null,
    claim: true,
  });

  if (quote.promoError) {
    return NextResponse.json({ error: quote.promoError }, { status: 409 });
  }

  // Nothing left to owe. Writing terms here would create a debt of zero that
  // somebody would eventually be asked to settle.
  if (!isGatewayPayable(quote.totalPaise)) {
    return NextResponse.json(
      { error: "There's nothing to pay for this booking.", free: true },
      { status: 409 }
    );
  }

  const outcome = await confirmPayLaterAppointment(admin, {
    appointment,
    amountDuePaise: quote.totalPaise,
    // Written inside the same claim that confirms, so no row can be left
    // marked pay-later but unconfirmed, or confirmed with no figure on it.
    extraFields: {
      list_price_paise: quote.listPricePaise,
      discount_paise: quote.discountPaise,
      ...(quote.source ? { discount_source: quote.source } : {}),
    },
  });

  if (outcome.error) {
    console.error("Failed to confirm a pay-later booking", appointmentId, outcome.error);
    return NextResponse.json(
      { error: "Could not confirm the booking. Please try again." },
      { status: 500 }
    );
  }
  if (!outcome.claimed) {
    // Cancelled underneath, between the read and the claim. No money moved
    // and nothing is owed, so it simply stays cancelled.
    return NextResponse.json(
      { error: "This booking is no longer active. Please book again." },
      { status: 409 }
    );
  }

  // `settleInvitesOnCapture` is deliberately NOT called. An inviter's reward
  // is earned when their friend's first session is **paid for**, and nothing
  // has been paid for yet -- that happens when this patient settles.

  return NextResponse.json({
    success: true,
    confirmed: outcome.autoConfirmed,
    // The figure that was written, not a re-read of it.
    amountDuePaise: quote.totalPaise,
    discountPaise: quote.discountPaise,
  });
}
