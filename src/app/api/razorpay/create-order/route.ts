import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SESSION_FEE_PAISE } from "@/lib/pricing";
import { isProfileActiveAndApproved } from "@/lib/supabase/requireActiveProfile";
import { createMeetEventForConfirmedAppointment } from "@/lib/googleCalendarSync";

// The amount is always resolved here, server-side, from the appointment's
// linked category price (or the flat base fee) — never trust an amount
// sent from the browser, or anyone could pay whatever they want.

export async function POST(request: NextRequest) {
  const { appointmentId } = await request.json();
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!(await isProfileActiveAndApproved(user.id))) {
    return NextResponse.json({ error: "Your account is not active — it is either awaiting admin approval or has been suspended." }, { status: 403 });
  }

  // RLS also enforces this (patients can only select their own rows), but
  // we check explicitly so a mismatched appointment gives a clear 404.
  const { data: appointment } = await supabase
    .from("appointments")
    .select(
      "id, patient_id, payment_status, category_id, razorpay_order_id, therapist_id, status, slot_time, duration_minutes, timezone, visit_mode, travel_fee_paise"
    )
    .eq("id", appointmentId)
    .eq("patient_id", user.id)
    .single();

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (appointment.payment_status === "paid") {
    return NextResponse.json({ error: "This booking is already paid" }, { status: 400 });
  }

  const admin = createAdminClient();
  const razorpay = new Razorpay({
    key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });

  // Re-attach to a prior order for this same appointment instead of always
  // minting a new one. Without this, "Pay Now" on a retry (e.g. the browser
  // closed before /api/razorpay/verify fired for an order the patient
  // actually paid) would create a second Razorpay order and overwrite
  // razorpay_order_id — orphaning the first, already-successful payment
  // with no link back to it, and risking a genuine double-charge if the
  // patient completes checkout again.
  if (appointment.razorpay_order_id) {
    try {
      const priorOrder = await razorpay.orders.fetch(appointment.razorpay_order_id);
      if (priorOrder.status === "paid") {
        // Razorpay already has a successful payment for this order — our
        // own /verify callback just never landed. Trust Razorpay's own
        // order status (this is a server-to-server lookup, not
        // client-supplied data) and record the payment now rather than
        // sending the patient through checkout a second time.
        const payments = await razorpay.orders.fetchPayments(appointment.razorpay_order_id);
        const capturedPayment = payments.items.find(
          (p) => p.status === "captured" || p.status === "authorized"
        );
        const shouldAutoConfirm =
          appointment.therapist_id && appointment.status === "requested";
        // Claim-check added alongside the Calendar integration: this write
        // previously had no read-back at all, so there was no way to know
        // whether it actually landed (e.g. lost a race against a
        // cancellation) before this. Needed so calendar-event creation below
        // is only attempted once we know the status change genuinely stuck.
        const { data: claimed } = await admin
          .from("appointments")
          .update({
            payment_status: "paid",
            razorpay_payment_id: capturedPayment?.id ?? null,
            paid_at: new Date().toISOString(),
            ...(shouldAutoConfirm ? { status: "confirmed" } : {}),
          })
          .eq("id", appointmentId)
          .eq("payment_status", "unpaid")
          .select("id")
          .maybeSingle();
        if (claimed && shouldAutoConfirm && appointment.therapist_id && appointment.slot_time) {
          await createMeetEventForConfirmedAppointment(admin, {
            appointmentId,
            patientId: appointment.patient_id,
            therapistId: appointment.therapist_id,
            slotTime: appointment.slot_time,
            durationMinutes: appointment.duration_minutes,
            timezone: appointment.timezone,
          });
        }
        return NextResponse.json({
          alreadyPaid: true,
          error:
            "This booking was already paid for in a previous attempt — no need to pay again. Refreshing your booking status.",
        });
      }
      if (priorOrder.status === "created" || priorOrder.status === "attempted") {
        // Not paid yet, not expired — reuse the same order rather than
        // abandoning it for a fresh one the patient could end up paying
        // twice for.
        return NextResponse.json({
          orderId: priorOrder.id,
          amount: priorOrder.amount,
          currency: priorOrder.currency,
        });
      }
    } catch (err) {
      // Prior order lookup failed (e.g. it's old enough Razorpay no longer
      // has it) — fall through and mint a fresh one below rather than
      // blocking the patient from paying at all.
      console.error("Failed to re-check prior Razorpay order", appointment.razorpay_order_id, err);
    }
  }

  // Resolve the real price for what was actually booked. Looked up via the
  // admin client (not the active-only public policy) so that if a category
  // gets deactivated after this appointment was created, the patient is
  // still charged the price they originally saw — not silently bumped to
  // the flat fallback fee. No category (e.g. a hospital-referred booking)
  // charges the flat base fee.
  let amountPaise = SESSION_FEE_PAISE;
  if (appointment.category_id) {
    const { data: category } = await admin
      .from("treatment_categories")
      .select("price_paise")
      .eq("id", appointment.category_id)
      .single();
    if (category) {
      amountPaise = category.price_paise;
    }
  }

  // A home-visit referral appointment (the only home-visit path that goes
  // through this generic route -- purchase-backed visits pay via
  // /api/home-visit/create-order instead) carries its own travel fee on top
  // of the session price, same as every other home-visit charge. Charged to
  // the patient, but never folded into amount_paid_paise itself -- that
  // column is what revenue/payout math multiplies by the therapist's share,
  // and travel is a pass-through paid in full, not a share-based earning
  // (see homeVisitPricing.ts). therapistPayouts.ts already reads
  // travel_fee_paise straight off the appointment for the payout side.
  const travelFeePaise =
    appointment.visit_mode === "home_visit" ? Math.max(0, appointment.travel_fee_paise ?? 0) : 0;

  const order = await razorpay.orders.create({
    amount: amountPaise + travelFeePaise,
    currency: "INR",
    receipt: appointmentId,
  });

  const { error: updateError } = await admin
    .from("appointments")
    .update({ razorpay_order_id: order.id, amount_paid_paise: amountPaise })
    .eq("id", appointmentId);

  if (updateError) {
    // If this doesn't save, /api/razorpay/verify's order-id match check
    // would reject an otherwise-legitimate payment later — fail now,
    // before the patient is sent to checkout, rather than after they pay.
    console.error("Failed to save razorpay_order_id for appointment", appointmentId, updateError);
    return NextResponse.json(
      { error: "Could not start payment. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
  });
}
