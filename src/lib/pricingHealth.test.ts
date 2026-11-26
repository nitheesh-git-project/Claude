import { describe, it, expect } from "vitest";
import { pricingFindings, type PricedBookingRow } from "./pricingHealth";

const us: PricedBookingRow = {
  id: "a1",
  patient_id: "p1",
  slot_time: "2026-11-28T09:30:00.000Z",
  // The owner's example: Rs 499 + 100% = Rs 998 -> $10.99 -> Rs 1,059.79.
  list_price_paise: 105_979,
  home_list_price_paise: 49_900,
  pricing_country: "US",
  pricing_markup_percent: 100,
};
const none = new Map<string, string | null>();

describe("pricing health", () => {
  it("passes a booking priced by the rule", () => {
    expect(pricingFindings([us], new Map([["p1", "US"]]))).toEqual([]);
  });

  it("ignores a rupee booking", () => {
    expect(pricingFindings([{ ...us, pricing_country: null, home_list_price_paise: null }], none)).toEqual([]);
  });

  it("flags an Indian account priced abroad -- the staging finding", () => {
    const [f] = pricingFindings([us], new Map([["p1", "IN"]]));
    expect(f.problem).toContain("Priced for US (+100%)");
    expect(f.problem).toContain("account is Indian");
  });

  it("flags a charge far above or below its own price", () => {
    expect(pricingFindings([{ ...us, list_price_paise: 300_000 }], none)[0].problem).toContain("far above");
    expect(pricingFindings([{ ...us, list_price_paise: 60_000 }], none)[0].problem).toContain("below");
  });

  it("flags a booking priced abroad with its facts missing", () => {
    expect(pricingFindings([{ ...us, home_list_price_paise: null }], none)[0].problem).toContain("not recorded");
    expect(pricingFindings([{ ...us, pricing_markup_percent: null }], none)[0].problem).toContain("not recorded");
  });

  it("reads a markup stored as numeric text", () => {
    expect(pricingFindings([{ ...us, pricing_markup_percent: "100.00" }], none)).toEqual([]);
  });
});
