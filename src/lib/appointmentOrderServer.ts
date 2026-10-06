// Mints (or re-attaches) the Razorpay order for one online appointment.
//
// Shared by `/api/razorpay/create-order` and `/api/appointments/create`. The
// second calls it for a booking it has just inserted, so the wizard's Pay tap
// reaches the Razorpay sheet in one round trip instead of two. Every rule
// lives here once -- re-attaching a prior order, recovering a payment whose
// verify never landed, claiming discounts under the row lock, refusing a
// zero-amount order as `free`, and writing the order id and figures back --
// so the two doors cannot grow different answers.
//
// The caller has already authenticated the patient, checked their standing,
// and loaded the appointment as theirs. The result is the exact body and
// status create-order has always answered with; callers pass it through.

import "server-only";
import Razorpay from "razorpay";
import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isGatewayPayable } from "@/lib/discounts";
import { resolveCheckoutQuote } from "@/lib/checkoutQuote";
import type { CountryPricing } from "@/lib/countryPricing";
import { confirmPaidAppointment } from "@/lib/confirmPaidAppointment";
import { recordPaymentCapture } from "@/lib/recordPaymentCapture";
import { settleInvitesOnCapture } from "@/lib/inviteRewardsServer";

export type OrderableAppointment = {
  id: string;
  patient_id: string;
  category_id: string | null;
  razorpay_order_id: string | null;
  visit_mode: string | null;
  travel_fee_paise: number | null;
};

export type MintedOrderResponse = {
  status: number;
  body: Record<string, unknown>;
};

export async function mintAppointmentOrder({
  supabase,
  appointment,
  appointmentId,
  promoCode,
  pricing,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  appointment: OrderableAppointment;
  appointmentId: string;
  /** The code the patient typed, or "" -- an identifier, never an amount. */
  promoCode: string;
  /** The request's own country row (countryPricingServer), or null. */
  pricing: CountryPricing | null;
}): Promise<MintedOrderResponse> {
  const typedPromoCode = promoCode;
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
    return {
      status: 500,
      body: {
        error:
          "Payments are temporarily unavailable. Please try again shortly or contact us.",
      },
    };
  }

  // Re-attach to a prior order for this same appointment instead of always
  // minting a new one. Without this, "Pay Now" on a retry (e.g. the browser
  // closed before /api/razorpay/verify fired for an order the patient
  // actually paid) would create a second Razorpay order and overwrite
  // razorpay_order_id - orphaning the first, already-successful payment
  // with no link back to it, and risking a genuine double-charge if the
  // patient completes checkout again.
  if (appointment.razorpay_order_id) {
    try {
      const priorOrder = await razorpay.orders.fetch(
        appointment.razorpay_order_id,
      );
      if (priorOrder.status === "paid") {
        // Razorpay already has a successful payment for this order - our
        // own /verify callback just never landed. Trust Razorpay's own
        // order status (this is a server-to-server lookup, not
        // client-supplied data) and record the payment now rather than
        // sending the patient through checkout a second time.
        //
        // This is a recovery path, not a second fulfilment path. It used to
        // write `payment_status: 'paid'` itself and stop there, which left
        // the booking looking settled while three things that a capture is
        // supposed to cause had not happened: no `payments` row, so the
        // money was absent from the one table the books are reconciled from;
        // no invite half settled, so the friend who introduced this patient
        // was never credited and their claimed half stayed open for ever;
        // and no auto-assignment, so a session the roster could have staffed
        // sat unassigned in the admin queue. Everything below is the same
        // sequence `/api/razorpay/verify` runs, through the same modules, so
        // the two cannot drift.
        const payments = await razorpay.orders.fetchPayments(
          appointment.razorpay_order_id,
        );
        const capturedPayment = payments.items.find(
          (p) => p.status === "captured" || p.status === "authorized",
        );

        const { data: confirmable } = await supabase
          .from("appointments")
          .select(
            "id, patient_id, therapist_id, status, slot_time, duration_minutes, timezone, visit_mode, preferred_therapist_id",
          )
          .eq("id", appointmentId)
          .single();

        if (confirmable) {
          const outcome = await confirmPaidAppointment(admin, {
            appointment: confirmable,
            razorpayPaymentId: capturedPayment?.id ?? null,
          });
          if (!outcome.claimed) {
            // The booking moved out from under the claim -- almost always a
            // cancellation. The money is real either way, so record it
            // against the row for reconciliation rather than losing it,
            // exactly as /verify does in the same situation.
            await admin
              .from("appointments")
              .update({
                payment_status: "paid",
                razorpay_payment_id: capturedPayment?.id ?? null,
                paid_at: new Date().toISOString(),
              })
              .eq("id", appointmentId)
              .eq("payment_status", "unpaid");
          }
        }

        // Idempotent by construction: if the webhook already handled this
        // capture, both of these find it settled and change nothing.
        if (capturedPayment?.id) {
          await recordPaymentCapture(admin, {
            orderId: appointment.razorpay_order_id,
            paymentId: capturedPayment.id,
          });
        }
        await settleInvitesOnCapture(admin, appointmentId);

        return {
          status: 200,
          body: {
            alreadyPaid: true,
            error:
              "This booking was already paid for in a previous attempt - no need to pay again. Refreshing your booking status.",
          },
        };
      }
      if (
        priorOrder.status === "created" ||
        priorOrder.status === "attempted"
      ) {
        // Not paid yet, not expired - reuse the same order rather than
        // abandoning it for a fresh one the patient could end up paying
        // twice for.
        return {
          status: 200,
          body: {
            orderId: priorOrder.id,
            amount: priorOrder.amount,
            currency: priorOrder.currency,
          },
        };
      }
    } catch (err) {
      // Prior order lookup failed (e.g. it's old enough Razorpay no longer
      // has it) - fall through and mint a fresh one below rather than
      // blocking the patient from paying at all.
      console.error(
        "Failed to re-check prior Razorpay order",
        appointment.razorpay_order_id,
        err,
      );
    }
  }

  // Price and discounts, resolved through the one module the quote route and
  // the free-confirmation route also use -- see checkoutQuote.ts for why
  // three callers sharing one resolution is the point. `claim: true` makes
  // this the authority: a promo code is claimed under a row lock and an
  // invite half is attached, both of which the read-only quote deliberately
  // does not do.
  const quote = await resolveCheckoutQuote(admin, {
    appointment: {
      id: appointment.id,
      patient_id: appointment.patient_id,
      category_id: appointment.category_id,
      visit_mode: appointment.visit_mode,
      travel_fee_paise: appointment.travel_fee_paise,
    },
    promoCode: typedPromoCode,
    claim: true,
    pricing,
  });

  if (typedPromoCode && quote.promoError) {
    // Refused rather than quietly charged at list price. The patient was
    // shown a figure with this code applied; taking more money than they
    // were quoted is the one outcome a payment screen must never produce.
    return { status: 409, body: { error: quote.promoError } };
  }

  // Nothing left to charge. Razorpay refuses a zero-amount order, and a
  // token rupee would charge a figure the patient was never quoted -- so a
  // free booking is confirmed by its own route instead, and this one says
  // so rather than inventing an amount.
  if (!isGatewayPayable(quote.totalPaise)) {
    return {
      status: 409,
      body: {
        free: true,
        totalPaise: quote.totalPaise,
        error: "This booking is free - confirm it without paying.",
      },
    };
  }

  const listPricePaise = quote.listPricePaise;
  const travelFeePaise = quote.travelFeePaise;
  const discount = {
    discountPaise: quote.discountPaise,
    payablePaise: quote.payablePaise,
    source: quote.source,
  };
  const amountPaise = quote.payablePaise;

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
    console.error(
      "Razorpay order creation failed for appointment",
      appointmentId,
      err,
    );
    return {
      status: 500,
      body: { error: "Could not start payment. Please try again." },
    };
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
    // would reject an otherwise-legitimate payment later - fail now,
    // before the patient is sent to checkout, rather than after they pay.
    console.error(
      "Failed to save razorpay_order_id for appointment",
      appointmentId,
      updateError,
    );
    return {
      status: 500,
      body: { error: "Could not start payment. Please try again." },
    };
  }

  return {
    status: 200,
    body: {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    },
  };
}
