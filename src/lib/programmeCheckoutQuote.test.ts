import { describe, it, expect } from "vitest";
import {
  PROGRAMME_FREE_REFUSAL,
  resolveProgrammeQuote,
  type ProgrammeQuoteInput,
} from "@/lib/programmeCheckoutQuote";
import { MINIMUM_CHARGE_PAISE, type DiscountOutcome } from "@/lib/discounts";
import { evaluatePromoCode, type PromoCode } from "@/lib/promoCodes";

const PER = 49900; // ₹499 a session
const LIST = 4 * PER; // a four-session programme

const input = (over: Partial<ProgrammeQuoteInput> = {}): ProgrammeQuoteInput => ({
  listPricePaise: LIST,
  sessionCount: 4,
  travel: { state: "none" },
  travelIncluded: false,
  promo: null,
  ...over,
});

const off = (discountPaise: number, listPricePaise = LIST): DiscountOutcome => ({
  listPricePaise,
  discountPaise,
  payablePaise: listPricePaise - discountPaise,
  source: "promo_code",
});

describe("resolveProgrammeQuote", () => {
  it("with no code, the total is the programme's list price", () => {
    const q = resolveProgrammeQuote(input());
    expect(q).toMatchObject({
      listPricePaise: LIST,
      discountPaise: 0,
      payablePaise: LIST,
      travelPaise: 0,
      totalPaise: LIST,
      promoRefusal: null,
      payable: true,
    });
  });

  it("takes a code off the programme total, in integer paise", () => {
    const q = resolveProgrammeQuote(input({ promo: off(39920) }));
    expect(q.discountPaise).toBe(39920);
    expect(q.payablePaise).toBe(LIST - 39920);
    expect(q.totalPaise).toBe(LIST - 39920);
    expect(Number.isInteger(q.totalPaise)).toBe(true);
  });

  it("agrees with what promoCodes works a programme-valid code out to", () => {
    const promo: PromoCode = {
      id: "p",
      code: "SPRING20",
      kind: "percent_off",
      value: 20,
      active: true,
      startsAt: null,
      endsAt: null,
      maxRedemptions: null,
      maxPerPatient: 1,
      minSpendPaise: 0,
      firstSessionOnly: false,
      validOnProgrammes: true,
    };
    const evaluated = evaluatePromoCode(promo, {
      listPricePaise: LIST,
      now: new Date("2026-10-01T00:00:00Z"),
      totalRedemptions: 0,
      patientRedemptions: 0,
      patientHasPaidBefore: true,
      target: "programme",
    });
    expect(evaluated.ok).toBe(true);
    const q = resolveProgrammeQuote(input({ promo: evaluated.ok ? evaluated.outcome : null }));
    expect(q.totalPaise).toBe(Math.floor(LIST * 0.8));
  });

  it("never discounts travel: it is added after the code, per visit", () => {
    const q = resolveProgrammeQuote(
      input({ travel: { state: "ready", perVisitPaise: 15000 }, promo: off(20000) })
    );
    expect(q.payablePaise).toBe(LIST - 20000);
    expect(q.travelPerVisitPaise).toBe(15000);
    expect(q.travelPaise).toBe(4 * 15000);
    expect(q.totalPaise).toBe(LIST - 20000 + 4 * 15000);
  });

  it("adds nothing for travel a package already includes", () => {
    const q = resolveProgrammeQuote(
      input({ travel: { state: "ready", perVisitPaise: 15000 }, travelIncluded: true })
    );
    expect(q.travelPaise).toBe(0);
    expect(q.totalPaise).toBe(LIST);
  });

  it("has no total until a home visit's travel is known -- an unknown fee is not zero", () => {
    for (const state of ["needs_address", "unserviceable", "unknown"] as const) {
      const q = resolveProgrammeQuote(input({ travel: { state } }));
      expect(q.totalPaise, state).toBeNull();
      expect(q.payable, state).toBe(false);
      expect(q.travelState).toBe(state);
    }
  });

  it("refuses a code that would make the programme free, and quotes without it", () => {
    const q = resolveProgrammeQuote(input({ promo: off(LIST) }));
    expect(q.promoRefusal).toBe(PROGRAMME_FREE_REFUSAL);
    expect(q.discountPaise).toBe(0);
    expect(q.totalPaise).toBe(LIST);
  });

  it("refuses one leaving less than the gateway minimum on the programme, even with travel on top", () => {
    const q = resolveProgrammeQuote(
      input({
        promo: off(LIST - (MINIMUM_CHARGE_PAISE - 1)),
        travel: { state: "ready", perVisitPaise: 15000 },
      })
    );
    expect(q.promoRefusal).toBe(PROGRAMME_FREE_REFUSAL);
    expect(q.payablePaise).toBe(LIST);
  });

  it("accepts a code leaving exactly the gateway minimum", () => {
    const q = resolveProgrammeQuote(input({ promo: off(LIST - MINIMUM_CHARGE_PAISE) }));
    expect(q.promoRefusal).toBeNull();
    expect(q.totalPaise).toBe(MINIMUM_CHARGE_PAISE);
    expect(q.payable).toBe(true);
  });

  it("ignores an outcome worked out on a different price rather than subtracting it", () => {
    const q = resolveProgrammeQuote(input({ promo: off(20000, LIST + 100) }));
    expect(q.discountPaise).toBe(0);
    expect(q.totalPaise).toBe(LIST);
  });

  it("ignores an outcome with no source or nothing off", () => {
    expect(
      resolveProgrammeQuote(input({ promo: { ...off(20000), source: null } })).discountPaise
    ).toBe(0);
    expect(resolveProgrammeQuote(input({ promo: off(0) })).discountPaise).toBe(0);
  });

  it("rounds a fractional list price to whole paise and never goes negative", () => {
    expect(resolveProgrammeQuote(input({ listPricePaise: 1000.6 })).listPricePaise).toBe(1001);
    const q = resolveProgrammeQuote(input({ listPricePaise: -5 }));
    expect(q.listPricePaise).toBe(0);
    expect(q.payable).toBe(false);
  });
});
