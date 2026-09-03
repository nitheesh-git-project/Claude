import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import {
  isProfileActive,
  isPatientProfile,
  approvePatientForGenuinePaymentAttempt,
} from "@/lib/supabase/requireActiveProfile";
import { resolveCheckoutQuote } from "@/lib/checkoutQuote";
import { isGatewayPayable } from "@/lib/discounts";
import { confirmPaidAppointment } from "@/lib/confirmPaidAppointment";
import { settleInvitesOnCapture } from "@/lib/inviteRewardsServer";

// A booking a discount took to nothing.
//
// Razorpay refuses a zero-amount order, and the old answer was to floor
// every discount at ₹1 — which meant a clinic advertising a free first
// session quietly charged a rupee nobody was quoted. The honest answer is
// not to go to a gateway at all: this route does everything
// `/api/razorpay/verify` does after a capture, minus the capture.
//
// Five rules hold it:
//
// 1. **The browser never says it is free.** The price and every discount are
//    re-resolved here through the same module the order route uses, under
//    the same row lock, and a payable above the gateway minimum is refused
//    with 409 — the patient is sent to pay instead. A route that trusted a
//    `free: true` flag would be a way to book anything for nothing.
// 2. **No `payments` row is written.** That table is the record of money
//    that moved, keyed on Razorpay's own order and payment ids; a collection
//    of zero has neither, and inventing them would put a fiction in the one
//    place the books are reconciled from.
// 3. **`amount_paid_paise` is 0 and all four discount facts are recorded**,
//    so the books can still say what this cost — a free session is inside
//    gross revenue as zero, with the giveaway named in `discount_paise` and
//    `discount_source`.
// 4. **Idempotent by the same claim the paid path uses.** A double tap finds
//    the row already paid and answers success rather than confirming twice.
// 5. **Everything else still happens**: the roster's auto-assignment, the
//    Meet event, the invite halves settling, the patient's approval. A free
//    session is a session.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
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
      "id, patient_id, payment_status, category_id, therapist_id, status, slot_time, duration_minutes, timezone, visit_mode, travel_fee_paise, preferred_therapist_id"
    )
    .eq("id", appointmentId)
    .eq("patient_id", user.id)
    .maybeSingle();

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (appointment.payment_status === "paid") {
    // A double tap, or the patient coming back to a screen they already
    // finished. Nothing to do and nothing to say sorry for.
    return NextResponse.json({ success: true, alreadyConfirmed: true });
  }

  // Reaching here means a signed-in patient is genuinely completing their own
  // real booking, which is the vetting -- the same reason create-order
  // approves on the attempt rather than on a completed payment.
  await approvePatientForGenuinePaymentAttempt(user.id);

  const admin = createAdminClient();
  const quote = await resolveCheckoutQuote(admin, {
    appointment,
    promoCode: typeof body.promoCode === "string" ? body.promoCode : null,
    claim: true,
  });

  if (quote.promoError) {
    return NextResponse.json({ error: quote.promoError }, { status: 409 });
  }

  // The whole point of the route, and the only thing standing between it and
  // being a way to book anything for nothing.
  if (isGatewayPayable(quote.totalPaise)) {
    return NextResponse.json(
      {
        error: "This booking still has an amount to pay.",
        totalPaise: quote.totalPaise,
      },
      { status: 409 }
    );
  }

  const outcome = await confirmPaidAppointment(admin, {
    appointment,
    razorpayPaymentId: null,
    amountPaidPaise: 0,
    // Written inside the same claim, so the discount facts can never be
    // recorded against a booking whose claim was lost.
    extraFields: {
      list_price_paise: quote.listPricePaise,
      discount_paise: quote.discountPaise,
      ...(quote.source ? { discount_source: quote.source } : {}),
    },
  });

  if (outcome.error) {
    console.error("Failed to confirm a free booking", appointmentId, outcome.error);
    return NextResponse.json(
      { error: "Could not confirm the booking. Please try again." },
      { status: 500 }
    );
  }
  if (!outcome.claimed) {
    // Unlike the paid path there is nothing to reconcile: no money moved, so
    // a booking that was cancelled underneath simply stays cancelled.
    return NextResponse.json(
      { error: "This booking is no longer active. Please book again." },
      { status: 409 }
    );
  }

  // An invite half spent on this booking is spent for good, and this patient
  // having completed a session is what turns their inviter's promise into a
  // reward. A free session counts for both -- the friend really did come.
  await settleInvitesOnCapture(admin, appointment.id);

  return NextResponse.json({
    success: true,
    confirmed: outcome.autoConfirmed,
    discountPaise: quote.discountPaise,
  });
}
