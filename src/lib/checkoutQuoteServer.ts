// The payment screen's quote, as a response body -- built in one place.
//
// Two routes answer it: `/api/appointments/quote` (while the patient is
// deciding) and `/api/appointments/create` (which hands the quote for the
// booking it just made back in the same response). The second exists purely
// for speed: the wizard used to create the booking, then make a separate
// round trip to re-quote it before it could open Razorpay -- and that trip
// repeated the auth, rate-limit and profile checks the create had just done.
// One builder keeps the two answers identical, which is the whole rule
// `checkoutQuote.ts` exists for.
//
// A read (`claim: false`): nothing is held, and create-order re-resolves
// under a row lock and refuses anything it cannot honour.

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCheckoutQuote, type QuotedAppointment } from "@/lib/checkoutQuote";
import { isGatewayPayable } from "@/lib/discounts";
import { readPayLaterBookingEligibility } from "@/lib/payLaterSettingsServer";

export type CheckoutQuoteBody = {
  listPricePaise: number;
  discountPaise: number;
  payablePaise: number;
  travelFeePaise: number;
  totalPaise: number;
  discountLabel: string | null;
  promoApplied: boolean;
  promoError: string | null | undefined;
  promoCodesEnabled: boolean;
  settlement: "free" | "pay_later" | "gateway";
  canPayNow: boolean;
};

export async function buildCheckoutQuoteBody(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    appointment: QuotedAppointment;
    /** The signed-in patient, or null for the anonymous category quote. */
    userId: string | null;
    hasProgramme: boolean;
    promoCode: string | null;
  }
): Promise<CheckoutQuoteBody> {
  const { appointment, userId, hasProgramme } = args;
  // Resolved **first**, because the pay-later eligibility check needs the
  // figure: a ceiling on what a patient may owe applies to what this booking
  // would actually add, not to its list price.
  const quote = await resolveCheckoutQuote(admin, {
    appointment,
    promoCode: args.promoCode,
    claim: false,
  });

  // Whether this patient may settle afterwards, re-derived rather than
  // assumed -- the screen must not offer a choice the confirmation route
  // would then refuse. A signed-out visitor is never eligible: terms are
  // granted to an account by an admin.
  const payLater =
    userId && !hasProgramme
      ? await readPayLaterBookingEligibility(admin, {
          patientId: userId,
          visitMode: appointment.visit_mode,
          hasProgramme,
          bookingAmountPaise: quote.payablePaise,
        })
      : { allowed: false as const, reason: "not_on_terms" as const };

  return {
    listPricePaise: quote.listPricePaise,
    discountPaise: quote.discountPaise,
    payablePaise: quote.payablePaise,
    travelFeePaise: quote.travelFeePaise,
    totalPaise: quote.totalPaise,
    discountLabel: quote.label,
    promoApplied: quote.source === "promo_code",
    promoError: quote.promoError,
    promoCodesEnabled: quote.promoCodesEnabled,
    // What the button should do, named for the decision. **Free beats pay
    // later** -- a discount that reached zero leaves nothing to settle.
    settlement: !isGatewayPayable(quote.totalPaise)
      ? "free"
      : payLater.allowed
        ? "pay_later"
        : "gateway",
    // Paying now stays possible for a patient on terms.
    canPayNow: isGatewayPayable(quote.totalPaise),
  };
}
