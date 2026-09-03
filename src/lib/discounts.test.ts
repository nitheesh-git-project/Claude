import { describe, it, expect } from "vitest";
import {
  applyFirstSessionOffer,
  applyGoodwillDiscount,
  resolveDiscount,
  describeDiscount,
  MINIMUM_CHARGE_PAISE,
  isFirstSessionEligible,
  sumDiscountsGiven,
  applyConfiguredAmountOff,
  DISCOUNT_SOURCES,
  type FirstSessionOffer,
  type DiscountSource,
  type DiscountOutcome,
} from "@/lib/discounts";

const LIST = 120000; // ₹1,200
const on = (o: Partial<FirstSessionOffer> = {}): FirstSessionOffer => ({
  enabled: true,
  type: "fixed",
  value: 49900,
  ...o,
});

describe("applyFirstSessionOffer", () => {
  it("prices a first session at the advertised figure", () => {
    const out = applyFirstSessionOffer(LIST, on());
    expect(out.payablePaise).toBe(49900);
    expect(out.discountPaise).toBe(70100);
    expect(out.source).toBe("first_session");
  });

  it("takes a percentage off", () => {
    const out = applyFirstSessionOffer(LIST, on({ type: "percent", value: 25 }));
    expect(out.payablePaise).toBe(90000);
    expect(out.discountPaise).toBe(30000);
  });

  it("rounds a percentage in the patient's favour", () => {
    // 33% of ₹999 leaves 669.33; the patient pays 669, not 670. An offer
    // that quietly charges a rupee more than advertised is worse than one
    // that charges a rupee less.
    const out = applyFirstSessionOffer(99900, on({ type: "percent", value: 33 }));
    expect(out.payablePaise).toBe(66933);
  });

  it("does nothing when the offer is off", () => {
    expect(applyFirstSessionOffer(LIST, on({ enabled: false })).discountPaise).toBe(0);
    expect(applyFirstSessionOffer(LIST, on({ enabled: false })).source).toBeNull();
  });

  it("never raises the bill", () => {
    // A "discount" priced above the list price is a misconfiguration, not a
    // surcharge -- it costs the offer, never the patient.
    const out = applyFirstSessionOffer(50000, on({ value: 90000 }));
    expect(out.payablePaise).toBe(50000);
    expect(out.discountPaise).toBe(0);
    expect(out.source).toBeNull();
  });

  it("floors at the minimum Razorpay will accept", () => {
    // 100% off is a free session, and Razorpay refuses a zero-amount order
    // -- unguarded that is a 500 at the last step of checkout.
    const out = applyFirstSessionOffer(LIST, on({ type: "percent", value: 100 }));
    expect(out.payablePaise).toBe(MINIMUM_CHARGE_PAISE);
    expect(out.discountPaise).toBe(LIST - MINIMUM_CHARGE_PAISE);
  });

  it("survives a misconfigured setting rather than failing the booking", () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      expect(applyFirstSessionOffer(LIST, on({ value: bad })).discountPaise).toBe(0);
    }
    expect(applyFirstSessionOffer(0, on()).discountPaise).toBe(0);
    expect(applyFirstSessionOffer(NaN, on()).discountPaise).toBe(0);
  });
});

describe("applyGoodwillDiscount", () => {
  it("takes the admin's amount off", () => {
    const out = applyGoodwillDiscount(LIST, 20000);
    expect(out.payablePaise).toBe(100000);
    expect(out.source).toBe("goodwill");
  });

  it("refuses an amount at or above the session price rather than flooring it", () => {
    // The one place the two discounts differ, deliberately. A configured
    // offer is floored so a misconfiguration cannot break checkout; a
    // goodwill amount is a number a person typed with the price on screen
    // beside it, so more than the price is a typo (2400 for 240) and
    // quietly charging ₹1 is far worse than saying no.
    expect(applyGoodwillDiscount(LIST, 500000).source).toBeNull();
    expect(applyGoodwillDiscount(LIST, LIST).source).toBeNull();
    expect(applyGoodwillDiscount(LIST, LIST - 1).source).toBe("goodwill");
  });

  it("still floors when the amount leaves less than the minimum charge", () => {
    // Here the admin did ask for nearly-all-off, so they get it.
    expect(applyGoodwillDiscount(LIST, LIST - 50).payablePaise).toBe(MINIMUM_CHARGE_PAISE);
  });

  it("ignores nonsense", () => {
    for (const bad of [0, -100, NaN]) {
      expect(applyGoodwillDiscount(LIST, bad).source).toBeNull();
    }
  });
});

describe("resolveDiscount", () => {
  it("does not stack", () => {
    // A bill nobody can explain is a bill somebody disputes. One discount.
    const out = resolveDiscount({
      listPricePaise: LIST,
      offer: on({ value: 100000 }),
      offerEligible: true,
      goodwillPaise: 20000,
    });
    expect(out.discountPaise).toBe(20000);
    expect(out.payablePaise).toBe(100000);
  });

  it("gives the patient the better of the two when both apply", () => {
    // The clinic has already agreed to both prices; charging the higher one
    // because an admin tried to help would be a perverse outcome.
    const out = resolveDiscount({
      listPricePaise: LIST,
      offer: on({ value: 49900 }),
      offerEligible: true,
      goodwillPaise: 10000,
    });
    expect(out.source).toBe("first_session");
    expect(out.payablePaise).toBe(49900);
  });

  it("ignores the offer for a patient who is not eligible", () => {
    const out = resolveDiscount({
      listPricePaise: LIST,
      offer: on(),
      offerEligible: false,
      goodwillPaise: null,
    });
    expect(out.discountPaise).toBe(0);
    expect(out.payablePaise).toBe(LIST);
  });

  it("still honours goodwill for a returning patient", () => {
    const out = resolveDiscount({
      listPricePaise: LIST,
      offer: on(),
      offerEligible: false,
      goodwillPaise: 30000,
    });
    expect(out.source).toBe("goodwill");
    expect(out.payablePaise).toBe(90000);
  });

  it("charges the list price when nothing applies", () => {
    const out = resolveDiscount({
      listPricePaise: LIST,
      offer: on({ enabled: false }),
      offerEligible: true,
      goodwillPaise: null,
    });
    expect(out.payablePaise).toBe(LIST);
    expect(out.source).toBeNull();
  });
});

describe("describeDiscount", () => {
  it("names the reason and the amount", () => {
    expect(describeDiscount("first_session", 70100)).toContain("First session offer");
    expect(describeDiscount("first_session", 70100)).toContain("₹701");
  });

  it("says nothing when there is nothing to say", () => {
    expect(describeDiscount(null, 0)).toBeNull();
    expect(describeDiscount("goodwill", 0)).toBeNull();
  });
});

describe("isFirstSessionEligible", () => {
  it("offers only to a patient who has never paid for a session", () => {
    expect(isFirstSessionEligible({ count: 0, failed: false })).toBe(true);
    expect(isFirstSessionEligible({ count: 1, failed: false })).toBe(false);
    expect(isFirstSessionEligible({ count: 9, failed: false })).toBe(false);
  });

  it("fails closed", () => {
    // Charging list price to somebody owed an offer is a complaint.
    // Discounting for everyone forever because a query failed is a hole in
    // the revenue nobody notices for a month.
    expect(isFirstSessionEligible({ count: null, failed: true })).toBe(false);
    expect(isFirstSessionEligible({ count: null, failed: false })).toBe(false);
  });
});

describe("sumDiscountsGiven", () => {
  it("totals what was given away, split by which rule gave it", () => {
    const out = sumDiscountsGiven([
      { discount_paise: 70100, discount_source: "first_session" },
      { discount_paise: 70100, discount_source: "first_session" },
      { discount_paise: 20000, discount_source: "goodwill" },
      { discount_paise: 0, discount_source: null },
    ]);
    expect(out.totalPaise).toBe(160200);
    expect(out.bySource.first_session).toBe(140200);
    expect(out.bySource.goodwill).toBe(20000);
    expect(out.count).toBe(3);
  });

  it("ignores rows with no discount or an unrecognised source", () => {
    // A source this build does not know about is not silently folded into
    // a total an admin reads as complete.
    const out = sumDiscountsGiven([
      { discount_paise: 5000, discount_source: "mystery_promo" },
      { discount_paise: null, discount_source: "goodwill" },
      {},
    ]);
    expect(out.totalPaise).toBe(0);
    expect(out.count).toBe(0);
  });
});

describe("applyConfiguredAmountOff", () => {
  it("takes the amount off and records the source given", () => {
    const out = applyConfiguredAmountOff(LIST, 20000, "promo_code");
    expect(out.payablePaise).toBe(100000);
    expect(out.source).toBe("promo_code");
  });

  it("floors rather than refuses, unlike a goodwill adjustment", () => {
    // The distinction is who produced the figure. A campaign amount that has
    // drifted past a cheap category is configuration; an amount typed with
    // the price on screen beside it is a typo.
    expect(applyConfiguredAmountOff(LIST, 500000, "invite_welcome").payablePaise).toBe(
      MINIMUM_CHARGE_PAISE
    );
    expect(applyGoodwillDiscount(LIST, 500000).source).toBeNull();
  });
});

describe("resolveDiscount with candidates", () => {
  const candidate = (paise: number, source: DiscountSource): DiscountOutcome => ({
    listPricePaise: LIST,
    discountPaise: paise,
    payablePaise: LIST - paise,
    source,
  });

  it("takes the largest discount on offer", () => {
    const out = resolveDiscount({
      listPricePaise: LIST,
      offer: on({ type: "percent", value: 10 }), // ₹120 off
      offerEligible: true,
      goodwillPaise: null,
      candidates: [candidate(40000, "promo_code")],
    });
    expect(out.source).toBe("promo_code");
    expect(out.discountPaise).toBe(40000);
  });

  it("gives a tie to the more deliberate decision", () => {
    // Goodwill beats a code, and a code beats a campaign that runs itself.
    const withGoodwill = resolveDiscount({
      listPricePaise: LIST,
      offer: on({ enabled: false }),
      offerEligible: false,
      goodwillPaise: 20000,
      candidates: [candidate(20000, "promo_code")],
    });
    expect(withGoodwill.source).toBe("goodwill");

    const withCode = resolveDiscount({
      listPricePaise: LIST,
      offer: on({ value: LIST - 20000 }), // ₹200 off, same as the code
      offerEligible: true,
      goodwillPaise: null,
      candidates: [candidate(20000, "promo_code")],
    });
    expect(withCode.source).toBe("promo_code");
  });

  it("still resolves to nothing when no rule applies", () => {
    const out = resolveDiscount({
      listPricePaise: LIST,
      offer: on({ enabled: false }),
      offerEligible: false,
      goodwillPaise: null,
      candidates: [],
    });
    expect(out.source).toBeNull();
    expect(out.payablePaise).toBe(LIST);
  });

  it("never stacks -- one source, one figure", () => {
    const out = resolveDiscount({
      listPricePaise: LIST,
      offer: on({ value: 100000 }), // ₹200 off
      offerEligible: true,
      goodwillPaise: 10000,
      candidates: [candidate(30000, "promo_code"), candidate(15000, "invite_welcome")],
    });
    expect(out.discountPaise).toBe(30000);
    expect(out.payablePaise).toBe(LIST - 30000);
  });
});

describe("sumDiscountsGiven across every source", () => {
  it("splits what discounting cost by which rule did it", () => {
    const totals = sumDiscountsGiven([
      { discount_paise: 20000, discount_source: "promo_code" },
      { discount_paise: 30000, discount_source: "invite_welcome" },
      { discount_paise: 20000, discount_source: "invite_reward" },
      { discount_paise: 10000, discount_source: "goodwill" },
    ]);
    expect(totals.totalPaise).toBe(80000);
    expect(totals.bySource.promo_code).toBe(20000);
    expect(totals.bySource.invite_welcome).toBe(30000);
    expect(totals.bySource.invite_reward).toBe(20000);
    expect(totals.count).toBe(4);
  });

  it("skips a source this build does not know", () => {
    // A row written by a future discount belongs missing from the breakdown
    // rather than silently miscounted into an existing line.
    const totals = sumDiscountsGiven([
      { discount_paise: 5000, discount_source: "some_future_rule" },
      { discount_paise: 20000, discount_source: "promo_code" },
    ]);
    expect(totals.totalPaise).toBe(20000);
    expect(totals.count).toBe(1);
  });
});

describe("describeDiscount", () => {
  it("names every source it can be given", () => {
    for (const source of DISCOUNT_SOURCES) {
      expect(describeDiscount(source, 20000)).toContain("₹200 off");
    }
  });
});
