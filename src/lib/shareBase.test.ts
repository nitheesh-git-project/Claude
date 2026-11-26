import { describe, it, expect } from "vitest";
import { markupPaise, shareBasePaise } from "./shareBase";

describe("what the therapist's share is taken of", () => {
  it("is the rupee list price for a session sold abroad", () => {
    // Rs 499 raised +100%, sold as $10.99 = Rs 1,059.79.
    const a = { list_price_paise: 105_979, home_list_price_paise: 49_900 };
    expect(shareBasePaise(105_979, a)).toBe(49_900);
    expect(Math.round((shareBasePaise(105_979, a) * 60) / 100)).toBe(29_940);
    expect(markupPaise(105_979, a)).toBe(56_079);
  });

  it("takes a discount off the base in the same proportion", () => {
    const a = { list_price_paise: 100_000, home_list_price_paise: 50_000 };
    expect(shareBasePaise(80_000, a)).toBe(40_000);
  });

  it("is the whole amount for a rupee booking or a row priced before the column", () => {
    expect(shareBasePaise(49_900, { list_price_paise: 49_900, home_list_price_paise: 49_900 })).toBe(49_900);
    expect(shareBasePaise(49_900, { list_price_paise: 49_900, home_list_price_paise: null })).toBe(49_900);
    expect(shareBasePaise(49_900, {})).toBe(49_900);
    expect(markupPaise(49_900, {})).toBe(0);
  });

  it("never raises the base above the fee", () => {
    expect(shareBasePaise(49_900, { list_price_paise: 40_000, home_list_price_paise: 49_900 })).toBe(49_900);
    expect(shareBasePaise(-5, { list_price_paise: 100, home_list_price_paise: 50 })).toBe(0);
  });
});
