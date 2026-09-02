// Acquisition discounting: what a patient is charged when the clinic is
// buying a first appointment, and what an admin can take off one booking by
// hand.
//
// Dependency-free and unit-tested, per the business-maths rule -- this
// decides what somebody is charged, and it should be reasonable about
// without a checkout rendered around it.
//
// Two rules shape everything here, and neither is negotiable:
//
// 1. **A discount is a rule an admin configured, never a number a browser
//    sent.** The same reason a therapist picks a package and not a price:
//    an amount that can be posted is an amount that can be posted wrong.
//    Every caller resolves the discount server-side from settings plus the
//    patient's own history.
//
// 2. **Travel is never discounted.** A home visit's travel fee is a
//    pass-through reimbursement paid to the therapist in full
//    (see homeVisitPricing.ts). Taking a discount out of it means the
//    therapist funds their own transport to subsidise the clinic's
//    marketing. Discounts apply to the service line only, and every caller
//    adds travel back afterwards.

/** Where a discount came from. Recorded on what was bought, so the books
 *  can tell "we sold cheap" from "we discounted", which is the question
 *  that decides whether an offer continues. */
export const DISCOUNT_SOURCES = ["first_session", "goodwill"] as const;
export type DiscountSource = (typeof DISCOUNT_SOURCES)[number];

export const DISCOUNT_SOURCE_LABELS: Record<DiscountSource, string> = {
  first_session: "First session offer",
  goodwill: "Goodwill adjustment",
};

export type FirstSessionOfferType = "fixed" | "percent";

export type FirstSessionOffer = {
  enabled: boolean;
  /** `fixed` sets the price outright ("first session ₹499"), which is what
   *  a clinic actually advertises. `percent` adapts across categories that
   *  are priced differently. */
  type: FirstSessionOfferType;
  /** Paise when `fixed`, whole percent 1-100 when `percent`. */
  value: number;
};

/**
 * The least anyone may be charged.
 *
 * Razorpay refuses a zero-amount order, so an unguarded 100%-off rule is a
 * 500 at the last step of checkout rather than a free session. One rupee is
 * the floor: a clinic that means "free" should not be taking the patient
 * through a payment screen at all.
 */
export const MINIMUM_CHARGE_PAISE = 100;

/** What a discount worked out to, and what it leaves to pay. */
export type DiscountOutcome = {
  listPricePaise: number;
  discountPaise: number;
  payablePaise: number;
  source: DiscountSource | null;
};

/**
 * The first-session offer, applied to one service line.
 *
 * Returns a zero discount rather than throwing on nonsense input: this sits
 * in front of a payment, and a misconfigured setting must cost the offer,
 * never the booking.
 */
export function applyFirstSessionOffer(
  listPricePaise: number,
  offer: FirstSessionOffer
): DiscountOutcome {
  const none: DiscountOutcome = {
    listPricePaise,
    discountPaise: 0,
    payablePaise: listPricePaise,
    source: null,
  };
  if (!offer.enabled) return none;
  if (!Number.isFinite(listPricePaise) || listPricePaise <= 0) return none;
  if (!Number.isFinite(offer.value) || offer.value <= 0) return none;

  let payable: number;
  if (offer.type === "percent") {
    const percent = Math.min(100, offer.value);
    // Rounded so the patient is never charged a fraction of a paise, and
    // rounded DOWN so the rounding favours the patient rather than the
    // clinic -- an offer that quietly charges a rupee more than advertised
    // is worse than one that charges a rupee less.
    payable = Math.floor(listPricePaise * (1 - percent / 100));
  } else {
    payable = Math.floor(offer.value);
  }

  // An offer priced above the list price is a misconfiguration, not a
  // surcharge. It costs the offer rather than raising the bill.
  if (payable >= listPricePaise) return none;

  payable = Math.max(MINIMUM_CHARGE_PAISE, payable);
  if (payable >= listPricePaise) return none;

  return {
    listPricePaise,
    discountPaise: listPricePaise - payable,
    payablePaise: payable,
    source: "first_session",
  };
}

/**
 * An admin's own adjustment on one booking.
 *
 * Deliberately separate from the offer above rather than another `type` on
 * it: this is a decision about one patient, taken by a person who has to
 * say why, and it is not a campaign that runs itself.
 */
export function applyGoodwillDiscount(
  listPricePaise: number,
  goodwillPaise: number
): DiscountOutcome {
  const none: DiscountOutcome = {
    listPricePaise,
    discountPaise: 0,
    payablePaise: listPricePaise,
    source: null,
  };
  if (!Number.isFinite(goodwillPaise) || goodwillPaise <= 0) return none;
  if (!Number.isFinite(listPricePaise) || listPricePaise <= 0) return none;

  // An amount at or above the session price is **refused**, not floored.
  //
  // This is the one place the two discounts behave differently, and
  // deliberately. The standing offer is a configuration value, so a
  // misconfigured 100%-off is floored to the minimum charge rather than
  // breaking checkout. A goodwill amount is a number a person typed into a
  // box with the session's price on screen beside it — so an amount larger
  // than the price is a typo (2400 for 240), and quietly charging ₹1
  // because of it is far worse than saying no.
  if (Math.floor(goodwillPaise) >= listPricePaise) return none;

  const payable = Math.max(MINIMUM_CHARGE_PAISE, listPricePaise - Math.floor(goodwillPaise));
  if (payable >= listPricePaise) return none;

  return {
    listPricePaise,
    discountPaise: listPricePaise - payable,
    payablePaise: payable,
    source: "goodwill",
  };
}

/**
 * The one discount that applies, when more than one could.
 *
 * **They do not stack.** Two reasons, and the second is the real one. A
 * stack can reach zero, which Razorpay refuses -- but more importantly, a
 * bill nobody can explain is a bill somebody will dispute, and "₹1,200 less
 * 60% less ₹300" is not a sentence a patient should have to parse on a
 * payment screen.
 *
 * Goodwill wins over the standing offer, always. An admin looked at this
 * patient and decided; a campaign did not. If the offer happens to be
 * larger, the patient pays the lower of the two -- the clinic has already
 * agreed to both prices, and charging the higher one because an admin tried
 * to help would be a perverse outcome.
 */
export function resolveDiscount({
  listPricePaise,
  offer,
  offerEligible,
  goodwillPaise,
}: {
  listPricePaise: number;
  offer: FirstSessionOffer;
  /** Whether this patient qualifies. Decided by the caller from the
   *  database, never from anything the browser sent. */
  offerEligible: boolean;
  goodwillPaise: number | null;
}): DiscountOutcome {
  const goodwill = applyGoodwillDiscount(listPricePaise, goodwillPaise ?? 0);
  const firstSession = offerEligible
    ? applyFirstSessionOffer(listPricePaise, offer)
    : { listPricePaise, discountPaise: 0, payablePaise: listPricePaise, source: null as null };

  if (goodwill.source && firstSession.source) {
    return goodwill.discountPaise >= firstSession.discountPaise ? goodwill : firstSession;
  }
  return goodwill.source ? goodwill : firstSession;
}

/** How the discount reads to the patient on a receipt or a payment screen. */
export function describeDiscount(
  source: DiscountSource | null,
  discountPaise: number
): string | null {
  if (!source || discountPaise <= 0) return null;
  const rupees = `₹${(discountPaise / 100).toLocaleString("en-IN")}`;
  return source === "first_session"
    ? `${DISCOUNT_SOURCE_LABELS.first_session} — ${rupees} off`
    : `${DISCOUNT_SOURCE_LABELS.goodwill} — ${rupees} off`;
}

/**
 * Whether this patient qualifies for the first-session offer.
 *
 * The test is "have they ever paid for a session before", asked of the
 * database. Nothing about it can be sent from a browser, and it cannot be
 * claimed twice -- a patient is only new once.
 *
 * Deliberately counts appointments rather than purchases: a programme can
 * only be bought after a session that was itself paid for, so an
 * appointment is the earlier and simpler fact. The booking being paid for
 * right now is still unpaid at this point and so does not count itself.
 *
 * Fails **closed** -- an unreadable answer means no discount. Charging list
 * price to somebody who was owed an offer is a complaint; discounting for
 * everyone forever because a query failed is a hole in the revenue nobody
 * notices for a month.
 */
export type PriorPaidLookup = { count: number | null; failed: boolean };

export function isFirstSessionEligible(prior: PriorPaidLookup): boolean {
  if (prior.failed) return false;
  return (prior.count ?? 1) === 0;
}

/**
 * What discounting cost over a set of bookings.
 *
 * Deliberately **not** part of `moneyByBucketFor`, and deliberately not a
 * deduction from operating profit. A discount means less money was
 * collected, so it is already inside gross revenue as a smaller number --
 * subtracting it again would count it twice and understate the clinic's
 * profit by exactly the amount it gave away.
 *
 * It is reported instead as its own figure, because it answers a question
 * no revenue line can: **what did buying these patients cost?** That is the
 * number that decides whether an offer continues, and without it a clinic
 * can only see that revenue is lower, never why.
 */
export function sumDiscountsGiven(
  rows: { discount_paise?: number | null; discount_source?: string | null }[]
): { totalPaise: number; bySource: Record<DiscountSource, number>; count: number } {
  const bySource: Record<DiscountSource, number> = { first_session: 0, goodwill: 0 };
  let totalPaise = 0;
  let count = 0;
  for (const row of rows) {
    const paise = row.discount_paise ?? 0;
    if (paise <= 0) continue;
    const source = row.discount_source;
    if (source !== "first_session" && source !== "goodwill") continue;
    bySource[source] += paise;
    totalPaise += paise;
    count += 1;
  }
  return { totalPaise, bySource, count };
}
