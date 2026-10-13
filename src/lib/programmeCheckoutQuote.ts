// What a recommended programme costs at checkout, resolved once.
//
// The programme's own counterpart of `checkoutQuote.ts`, and dependency-free
// so the arithmetic is tested without a database. Two callers must not be
// able to disagree about it: `/api/care-plan/quote`, which the review-and-pay
// page prints, and `/api/care-plan/create-order`, which mints the Razorpay
// order from it. Quoting one figure and charging another is the one thing a
// payment screen must never do, and this is where that is made impossible
// rather than merely unwritten.
//
// The inputs are already authoritative when they arrive here: the list price
// is the live catalog rate the route re-read (priced for the visitor's
// country for a video programme), the travel fee is the served area's own,
// and the promo outcome is what `promoCodes.ts` worked out from the code's
// row. Nothing here is a number a browser sent.
//
// Three rules hold it:
//   1. **The discount applies to the programme, never to travel.** Travel is
//      a pass-through reimbursement paid to the therapist in full; taking a
//      code off it would make them fund their own transport to subsidise the
//      clinic's marketing. Same rule as a single session (docs/rules/
//      discounts.md).
//   2. **A code may not make a programme free.** A single session that a
//      discount takes to zero has its own confirm-free route; a programme
//      does not, and inventing one would mean a purchase that is "paid" with
//      no payment, credits minted from nothing and a refund path that has
//      never seen a zero. So a code that would leave less than the gateway
//      minimum on the programme line is refused with a sentence, and the
//      patient pays the list price or asks the clinic.
//   3. **An unknown travel fee is not a zero.** Until the area is known the
//      total is null, and the page says so rather than printing a figure
//      that is about to grow.

import { MINIMUM_CHARGE_PAISE, isGatewayPayable, type DiscountOutcome } from "@/lib/discounts";
import { computeHomeVisitTotal } from "@/lib/homeVisitPricing";

/** Where a home-visit programme's travel fee stands. A video programme has
 *  no travel at all. */
export type ProgrammeTravel =
  | { state: "none" }
  | { state: "needs_address" }
  | { state: "unserviceable" }
  | { state: "unknown" }
  | { state: "ready"; perVisitPaise: number };

export type ProgrammeQuoteInput = {
  /** The programme line before anything comes off, integer paise. */
  listPricePaise: number;
  /** Sessions or visits in the programme. */
  sessionCount: number;
  travel: ProgrammeTravel;
  /** The package's own `travel_fee_included`: travel already in the price. */
  travelIncluded: boolean;
  /** What an accepted code works out to on `listPricePaise`, or null. */
  promo: DiscountOutcome | null;
};

export type ProgrammeQuote = {
  listPricePaise: number;
  /** What the code took off the programme line. Never touches travel. */
  discountPaise: number;
  /** The programme line after the discount -- what `amount_paid_paise`
   *  records, since travel is never revenue. */
  payablePaise: number;
  travelState: ProgrammeTravel["state"];
  /** The area's fee for one visit, or null when not known. */
  travelPerVisitPaise: number | null;
  /** Travel for the whole programme (0 when included or not a visit). */
  travelPaise: number;
  travelIncluded: boolean;
  /** What the patient is asked for, or null while travel is unknown. */
  totalPaise: number | null;
  /** Set when the code was refused by the rules above. The caller shows it
   *  and quotes without the code; create-order answers 409 with it. */
  promoRefusal: string | null;
  /** A known total the gateway will take. */
  payable: boolean;
};

export const PROGRAMME_FREE_REFUSAL =
  "That code would cover this whole programme, which can't be paid for online. Please contact the clinic and we'll sort it out with you.";

/** The programme quote. Integer paise in, integer paise out. */
export function resolveProgrammeQuote(input: ProgrammeQuoteInput): ProgrammeQuote {
  const list = Math.max(0, Math.round(Number.isFinite(input.listPricePaise) ? input.listPricePaise : 0));
  const count = Number.isFinite(input.sessionCount) && input.sessionCount > 0 ? Math.floor(input.sessionCount) : 1;

  // An outcome worked out on a different figure is not this programme's --
  // the route re-priced between the preview and now -- so it is ignored
  // rather than subtracted from a price it was not calculated against.
  let discount = 0;
  if (
    input.promo &&
    input.promo.source &&
    input.promo.listPricePaise === list &&
    input.promo.discountPaise > 0
  ) {
    discount = Math.min(list, Math.floor(input.promo.discountPaise));
  }

  let promoRefusal: string | null = null;
  if (discount > 0 && list - discount < MINIMUM_CHARGE_PAISE) {
    promoRefusal = PROGRAMME_FREE_REFUSAL;
    discount = 0;
  }
  const payable = list - discount;

  let travelPerVisitPaise: number | null = null;
  let travelPaise = 0;
  let totalPaise: number | null = payable;
  switch (input.travel.state) {
    case "none":
      break;
    case "ready": {
      travelPerVisitPaise = Math.max(0, Math.round(input.travel.perVisitPaise));
      // The same per-visit maths the purchase is later booked against, so a
      // programme's travel can never be added up two ways.
      const total = computeHomeVisitTotal({
        packagePricePaise: payable,
        travelFeePaise: travelPerVisitPaise,
        travelIncluded: input.travelIncluded,
        visitCount: count,
      });
      travelPaise = total.totalPaise - payable;
      totalPaise = total.totalPaise;
      break;
    }
    default:
      // Needs an address, not served, or not known: no honest total yet.
      totalPaise = null;
  }

  return {
    listPricePaise: list,
    discountPaise: discount,
    payablePaise: payable,
    travelState: input.travel.state,
    travelPerVisitPaise,
    travelPaise,
    travelIncluded: input.travelIncluded,
    totalPaise,
    promoRefusal,
    payable: totalPaise !== null && isGatewayPayable(totalPaise),
  };
}
