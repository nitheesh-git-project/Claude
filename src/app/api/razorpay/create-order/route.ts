import { NextRequest, NextResponse } from "next/server";
import {
  isFirstSessionEligible,
  resolveDiscount,
  type FirstSessionOffer,
  type PriorPaidLookup,
} from "@/lib/discounts";
import Razorpay from "razorpay";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SESSION_FEE_PAISE } from "@/lib/pricing";
import {
  isProfileActive,
  isPatientProfile,
  approvePatientForGenuinePaymentAttempt,
} from "@/lib/supabase/requireActiveProfile";
import { createMeetEventForConfirmedAppointment } from "@/lib/googleCalendarSync";

// The amount is always resolved here, server-side, from the appointment's
// linked category price (or the flat base fee) — never trust an amount
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
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { appointmentId } = await request.json();
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }

  // Deliberately isProfileActive, not isProfileActiveAndApproved:
  // appointments_insert_own already lets an unapproved patient's
  // pre-payment appointment row through, and reaching this route at all
  // means they're genuinely trying to pay for it -- gating checkout itself
  // on approval would mean that attempt can never happen. See
  // approvePatientForGenuinePaymentAttempt for why the vetting fires here,
  // on the attempt, rather than waiting on a completed payment.
  if (!(await isProfileActive(user.id))) {
    return NextResponse.json({ error: "Your account has been suspended." }, { status: 403 });
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

  // Reaching here means a signed-in patient is genuinely trying to pay for
  // their own real appointment -- that's the vetting, whether or not the
  // payment that follows actually succeeds (see the escape hatch in
  // BookingWizard.tsx, which sends a patient straight to their dashboard
  // with the booking left pending after repeated failed/dismissed
  // attempts). Awaited (this is a serverless function -- an un-awaited
  // write can get cut off once the response is sent) but never lets a
  // failure here block checkout; see the function's own error handling.
  await approvePatientForGenuinePaymentAttempt(user.id);

  if (appointment.payment_status === "paid") {
    return NextResponse.json({ error: "This booking is already paid" }, { status: 400 });
  }

  const admin = createAdminClient();
  // The Razorpay SDK throws synchronously in its constructor when key_id is
  // missing ("`key_id` or `oauthToken` is mandatory") -- unguarded, that
  // crashes the whole route handler with an empty-body 500 that the
  // client's res.json() can't parse, surfacing as the misleading "Could not
  // load the payment gateway" message with no hint that it's actually a
  // missing/misconfigured NEXT_PUBLIC_RAZORPAY_KEY_ID /
  // RAZORPAY_KEY_SECRET env var for this deployment.
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

  // Discounts, resolved here and nowhere else.
  //
  // Both the standing first-session offer and any goodwill an admin put on
  // this booking are read server-side: the offer from settings plus this
  // patient's own payment history, the adjustment from the appointment row
  // an admin wrote it to. Nothing about either arrives in the request body,
  // for the same reason the price never has.
  //
  // Applied to the service line only. Travel is a pass-through paid to the
  // therapist in full, so it is added back after the discount and never
  // reduced by it -- discounting travel means the therapist funds their own
  // transport to subsidise the clinic's marketing.
  const listPricePaise = amountPaise;
  const discount = resolveDiscount({
    listPricePaise,
    offer: await readFirstSessionOffer(admin),
    offerEligible: isFirstSessionEligible(await countPriorPaidSessions(admin, user.id)),
    goodwillPaise: await readGoodwillOnAppointment(admin, appointmentId),
  });
  amountPaise = discount.payablePaise;

  // Guarded like /api/home-visit/create-order's own order.create call: an
  // uncaught throw here (bad/missing Razorpay keys, a Razorpay API hiccup)
  // would otherwise crash the route handler with a non-JSON 500, which the
  // client's res.json() then fails to parse -- surfacing as the generic
  // "Could not load the payment gateway" message regardless of what
  // actually went wrong, with no way to tell the two apart from the UI.
  let order;
  try {
    order = await razorpay.orders.create({
      amount: amountPaise + travelFeePaise,
      currency: "INR",
      receipt: appointmentId,
    });
  } catch (err) {
    console.error("Razorpay order creation failed for appointment", appointmentId, err);
    return NextResponse.json(
      { error: "Could not start payment. Please try again." },
      { status: 500 }
    );
  }

  const { error: updateError } = await admin
    .from("appointments")
    .update({
      razorpay_order_id: order.id,
      amount_paid_paise: amountPaise,
      // All four facts, so the books can tell "we sold cheap" from "we
      // discounted". Written even when nothing came off, so a row without a
      // discount is distinguishable from one recorded before this existed.
      list_price_paise: listPricePaise,
      discount_paise: discount.discountPaise,
      ...(discount.source ? { discount_source: discount.source } : {}),
    })
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

/**
 * The standing offer, read in its own call.
 *
 * Migration-dependent columns, and failing to read them must cost the offer
 * rather than the booking -- so an error here returns a disabled offer and
 * the patient pays list price, which is the safe direction.
 */
async function readFirstSessionOffer(
  admin: ReturnType<typeof createAdminClient>
): Promise<FirstSessionOffer> {
  const off: FirstSessionOffer = { enabled: false, type: "fixed", value: 0 };
  try {
    const { data, error } = await admin
      .from("site_settings")
      .select(
        "first_session_offer_enabled, first_session_offer_type, first_session_offer_value"
      )
      .maybeSingle();
    if (error || !data) return off;
    return {
      enabled: data.first_session_offer_enabled === true,
      type: data.first_session_offer_type === "percent" ? "percent" : "fixed",
      value: typeof data.first_session_offer_value === "number" ? data.first_session_offer_value : 0,
    };
  } catch {
    return off;
  }
}

/**
 * Has this patient ever paid for a session before?
 *
 * The whole eligibility rule, asked of the database rather than of anything
 * the browser sent. `failed` is carried rather than swallowed so
 * `isFirstSessionEligible` can fail closed on it -- an unreadable answer
 * must not become a discount for everybody.
 */
async function countPriorPaidSessions(
  admin: ReturnType<typeof createAdminClient>,
  patientId: string
): Promise<PriorPaidLookup> {
  try {
    const { count, error } = await admin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", patientId)
      .eq("payment_status", "paid");
    if (error) return { count: null, failed: true };
    return { count: count ?? 0, failed: false };
  } catch {
    return { count: null, failed: true };
  }
}

/** Any adjustment an admin already wrote onto this booking. */
async function readGoodwillOnAppointment(
  admin: ReturnType<typeof createAdminClient>,
  appointmentId: string
): Promise<number | null> {
  try {
    const { data } = await admin
      .from("appointments")
      .select("discount_paise, discount_source")
      .eq("id", appointmentId)
      .maybeSingle();
    const row = data as { discount_paise?: number | null; discount_source?: string | null } | null;
    if (!row || row.discount_source !== "goodwill") return null;
    return row.discount_paise ?? null;
  } catch {
    return null;
  }
}
