import { describe, it, expect } from "vitest";
import {
  normalizePromoCode,
  isWellFormedPromoCode,
  evaluatePromoCode,
  promoOutcome,
  promoCodeState,
  describePromoCode,
  type PromoCode,
  type PromoContext,
} from "@/lib/promoCodes";
import { MINIMUM_CHARGE_PAISE } from "@/lib/discounts";

const LIST = 120000; // ₹1,200
const NOW = new Date("2026-03-10T10:00:00Z");

const code = (over: Partial<PromoCode> = {}): PromoCode => ({
  id: "p1",
  code: "WELCOME200",
  kind: "amount_off",
  value: 20000,
  active: true,
  startsAt: null,
  endsAt: null,
  maxRedemptions: null,
  maxPerPatient: 1,
  minSpendPaise: 0,
  firstSessionOnly: false,
  ...over,
});

const ctx = (over: Partial<PromoContext> = {}): PromoContext => ({
  listPricePaise: LIST,
  now: NOW,
  totalRedemptions: 0,
  patientRedemptions: 0,
  patientHasPaidBefore: false,
  ...over,
});

describe("normalizePromoCode", () => {
  it("reads one code however it was typed", () => {
    expect(normalizePromoCode(" welcome 200 ")).toBe("WELCOME200");
    expect(normalizePromoCode("Welcome200")).toBe("WELCOME200");
  });

  it("accepts letters and digits only", () => {
    expect(isWellFormedPromoCode("WELCOME200")).toBe(true);
    expect(isWellFormedPromoCode("WEL-COME")).toBe(false);
    expect(isWellFormedPromoCode("AB")).toBe(false);
    expect(isWellFormedPromoCode("")).toBe(false);
  });
});

describe("promoOutcome", () => {
  it("takes an amount off", () => {
    const out = promoOutcome(code(), LIST);
    expect(out.payablePaise).toBe(100000);
    expect(out.discountPaise).toBe(20000);
    expect(out.source).toBe("promo_code");
  });

  it("takes a percentage off, rounded in the patient's favour", () => {
    // 33% of ₹999 leaves 669.33 -- the patient pays 669.
    const out = promoOutcome(code({ kind: "percent_off", value: 33 }), 99900);
    expect(out.payablePaise).toBe(66933);
  });

  it("floors a 100%-off campaign at the minimum charge", () => {
    // Razorpay refuses a zero-amount order, so an unguarded 100% code is a
    // 500 at the last step of checkout rather than a free session.
    const out = promoOutcome(code({ kind: "percent_off", value: 100 }), LIST);
    expect(out.payablePaise).toBe(MINIMUM_CHARGE_PAISE);
    expect(out.source).toBe("promo_code");
  });

  it("floors an amount larger than the price rather than refusing it", () => {
    // Opposite of a goodwill adjustment: this figure came out of a campaign
    // set up weeks ago, so drifting past a cheap category is configuration,
    // not a typo made with the price on screen.
    const out = promoOutcome(code({ value: 500000 }), LIST);
    expect(out.payablePaise).toBe(MINIMUM_CHARGE_PAISE);
  });
});

describe("evaluatePromoCode", () => {
  it("applies a running code", () => {
    const result = evaluatePromoCode(code(), ctx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcome.discountPaise).toBe(20000);
      expect(result.code).toBe("WELCOME200");
    }
  });

  it("refuses a paused campaign", () => {
    const result = evaluatePromoCode(code({ active: false }), ctx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("inactive");
  });

  it("refuses before the window opens and once it has closed", () => {
    const early = evaluatePromoCode(code({ startsAt: "2026-04-01T00:00:00Z" }), ctx());
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.reason).toBe("not_started");

    const late = evaluatePromoCode(code({ endsAt: "2026-03-01T00:00:00Z" }), ctx());
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.reason).toBe("expired");
  });

  it("treats the end of the window as exclusive", () => {
    // A code ending "1 April" ends at the first instant of 1 April, so a
    // checkout at exactly that instant is too late. Anything else makes the
    // last day of a campaign ambiguous.
    const at = new Date("2026-04-01T00:00:00Z");
    const result = evaluatePromoCode(code({ endsAt: "2026-04-01T00:00:00Z" }), ctx({ now: at }));
    expect(result.ok).toBe(false);
  });

  it("refuses once the total cap is reached", () => {
    const result = evaluatePromoCode(
      code({ maxRedemptions: 100 }),
      ctx({ totalRedemptions: 100 })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("exhausted");
  });

  it("refuses a second claim by the same patient", () => {
    const result = evaluatePromoCode(code(), ctx({ patientRedemptions: 1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("already_used");
  });

  it("allows a repeat claim up to the per-patient cap", () => {
    const result = evaluatePromoCode(
      code({ maxPerPatient: 3 }),
      ctx({ patientRedemptions: 2 })
    );
    expect(result.ok).toBe(true);
  });

  it("refuses a first-session code to a patient who has paid before", () => {
    const result = evaluatePromoCode(
      code({ firstSessionOnly: true }),
      ctx({ patientHasPaidBefore: true })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("first_session_only");
  });

  it("refuses under the minimum spend, naming the figure", () => {
    const result = evaluatePromoCode(code({ minSpendPaise: 200000 }), ctx());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("min_spend");
      expect(result.message).toContain("₹2,000");
    }
  });

  it("refuses a code that would take nothing off", () => {
    // A green tick beside an unchanged total is how a patient concludes the
    // payment screen is lying to them.
    const result = evaluatePromoCode(code({ value: 0 }), ctx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no_effect");
  });

  it("gives every refusal a sentence the patient can act on", () => {
    const refusals = [
      evaluatePromoCode(code({ active: false }), ctx()),
      evaluatePromoCode(code({ endsAt: "2026-01-01T00:00:00Z" }), ctx()),
      evaluatePromoCode(code({ maxRedemptions: 1 }), ctx({ totalRedemptions: 1 })),
      evaluatePromoCode(code(), ctx({ patientRedemptions: 1 })),
    ];
    for (const result of refusals) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message.length).toBeGreaterThan(10);
    }
  });
});

describe("promoCodeState", () => {
  it("names where a campaign is in its life", () => {
    expect(promoCodeState({ active: false, startsAt: null, endsAt: null }, NOW)).toBe("paused");
    expect(
      promoCodeState({ active: true, startsAt: "2026-04-01T00:00:00Z", endsAt: null }, NOW)
    ).toBe("scheduled");
    expect(
      promoCodeState({ active: true, startsAt: null, endsAt: "2026-01-01T00:00:00Z" }, NOW)
    ).toBe("ended");
    expect(promoCodeState({ active: true, startsAt: null, endsAt: null }, NOW)).toBe("running");
  });
});

describe("describePromoCode", () => {
  it("says what a campaign gives and how many may have it", () => {
    expect(describePromoCode(code({ maxRedemptions: 100 }))).toBe("₹200 off · 100 uses");
    expect(describePromoCode(code({ kind: "percent_off", value: 20 }))).toBe(
      "20% off · unlimited uses"
    );
  });
});
