import { describe, expect, it } from "vitest";
import {
  COUNTRIES,
  convertPaiseForDisplay,
  countryInfo,
  currencyDecimals,
  formatMinor,
  formatPriceForCountry,
  homeVisitsOfferedIn,
  isPricedLocally,
  isValidMarkup,
  priceForCountry,
  rateAgeLabel,
  ratesAreStale,
  resolveCountry,
  roundUpToNinetyNine,
  type CountryPricing,
} from "./countryPricing";

// A rate chosen so the owner's example reads exactly: ₹998 -> $10.35.
const US: CountryPricing = { code: "US", currency: "USD", enabled: true, markupPercent: 100, unitsPerInr: 0.01037 };

describe("roundUpToNinetyNine", () => {
  it("rounds cents up to .99, never down", () => {
    expect(roundUpToNinetyNine(1035, 2)).toBe(1099);
    expect(roundUpToNinetyNine(1099, 2)).toBe(1099);
    expect(roundUpToNinetyNine(1100, 2)).toBe(1199);
    expect(roundUpToNinetyNine(1, 2)).toBe(99);
  });
  it("ends a currency without cents in 9", () => {
    expect(roundUpToNinetyNine(1532, 0)).toBe(1539);
    expect(roundUpToNinetyNine(1539, 0)).toBe(1539);
    expect(roundUpToNinetyNine(1540, 0)).toBe(1549);
  });
  it("ends a three-decimal currency in .990", () => {
    expect(roundUpToNinetyNine(3125, 3)).toBe(3990);
    expect(roundUpToNinetyNine(3991, 3)).toBe(4990);
  });
  it("rounds a fractional minor amount up first", () => {
    expect(roundUpToNinetyNine(1099.2, 2)).toBe(1199);
  });
});

describe("priceForCountry", () => {
  it("reproduces the owner's example: ₹499, +100%, ₹998, $10.35, $10.99", () => {
    const p = priceForCountry(49900, US);
    expect(p.raisedPaise).toBe(99800);
    expect(Math.round(p.convertedMinor)).toBe(1035);
    expect(p.displayMinor).toBe(1099);
    expect(formatMinor(p.displayMinor, p.currency)).toBe("$10.99");
  });

  it("charges the INR equal of the rounded figure, never less", () => {
    const p = priceForCountry(49900, US);
    // 10.99 / 0.01037 = 1059.787... rupees -> 105979 paise, rounded up.
    expect(p.chargePaise).toBe(105979);
    expect((p.chargePaise / 100) * US.unitsPerInr!).toBeGreaterThanOrEqual(10.99 - 1e-9);
    // ...and the charge converted back reads as the price shown.
    expect(convertPaiseForDisplay(p.chargePaise, US).minor).toBe(1099);
  });

  it("leaves India, a switched-off country and one without a rate in rupees", () => {
    for (const cfg of [null, { ...US, enabled: false }, { ...US, unitsPerInr: null }, { ...US, code: "IN" }]) {
      const p = priceForCountry(49900, cfg);
      expect(p).toMatchObject({ currency: "INR", displayMinor: 49900, chargePaise: 49900 });
    }
  });

  it("keeps a free price free", () => {
    expect(priceForCountry(0, US)).toMatchObject({ displayMinor: 0, chargePaise: 0 });
  });

  it("prices a zero-markup country at the plain conversion, rounded up", () => {
    const p = priceForCountry(49900, { ...US, markupPercent: 0 });
    expect(p.raisedPaise).toBe(49900);
    expect(p.displayMinor).toBe(599); // 5.17 -> 5.99
  });

  it("handles a currency without cents", () => {
    const jp: CountryPricing = { code: "JP", currency: "JPY", enabled: true, markupPercent: 50, unitsPerInr: 1.79 };
    const p = priceForCountry(49900, jp);
    expect(p.decimals).toBe(0);
    expect(p.displayMinor % 10).toBe(9);
    expect(p.displayMinor).toBeGreaterThanOrEqual(Math.ceil(p.convertedMinor));
  });
});

describe("formatting", () => {
  it("prints rupees exactly as before for an Indian visitor", () => {
    expect(formatPriceForCountry(49900, null)).toBe("₹499");
    expect(formatMinor(311880, "INR")).toBe("₹3,118.80");
  });
  it("prints the local symbol", () => {
    expect(formatMinor(899, "GBP")).toBe("£8.99");
    expect(formatMinor(1539, "JPY")).toBe("¥1,539");
  });
  it("knows each currency's decimal places", () => {
    expect(currencyDecimals("USD")).toBe(2);
    expect(currencyDecimals("JPY")).toBe(0);
    expect(currencyDecimals("KWD")).toBe(3);
  });
});

describe("resolveCountry", () => {
  it("uses the visitor's choice when the picker is allowed", () => {
    expect(resolveCountry({ chosen: "gb", detected: "US", pickerAllowed: true })).toBe("GB");
  });
  it("ignores the choice when the picker is off", () => {
    expect(resolveCountry({ chosen: "GB", detected: "US", pickerAllowed: false })).toBe("US");
  });
  it("falls back to India for anything unknown or missing", () => {
    expect(resolveCountry({ chosen: "ZZ", detected: "XX", pickerAllowed: true })).toBe("IN");
    expect(resolveCountry({ chosen: null, detected: null, pickerAllowed: true })).toBe("IN");
    expect(resolveCountry({ chosen: "<script>", detected: "", pickerAllowed: true })).toBe("IN");
  });
  it("lets a visitor choose India", () => {
    expect(resolveCountry({ chosen: "IN", detected: "US", pickerAllowed: true })).toBe("IN");
  });
});

describe("the rest", () => {
  it("lists each country once, with a real currency", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).not.toContain("IN");
    for (const c of COUNTRIES) expect(() => new Intl.NumberFormat("en", { style: "currency", currency: c.currency })).not.toThrow();
  });
  it("names India even though it is not in the list", () => {
    expect(countryInfo("in")).toEqual({ code: "IN", name: "India", currency: "INR" });
  });
  it("bounds the markup", () => {
    expect(isValidMarkup(0)).toBe(true);
    expect(isValidMarkup(500)).toBe(true);
    expect(isValidMarkup(-1)).toBe(false);
    expect(isValidMarkup(501)).toBe(false);
    expect(isValidMarkup(Number.NaN)).toBe(false);
  });
  it("prices locally only when switched on and rated", () => {
    expect(isPricedLocally(US)).toBe(true);
    expect(isPricedLocally({ ...US, enabled: false })).toBe(false);
  });
  it("offers home visits in India always, elsewhere only when allowed", () => {
    expect(homeVisitsOfferedIn("IN", false)).toBe(true);
    expect(homeVisitsOfferedIn("US", false)).toBe(false);
    expect(homeVisitsOfferedIn("US", true)).toBe(true);
  });
});

describe("rate age", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");
  it("reads the age in plain words", () => {
    expect(rateAgeLabel(null, now)).toBe("never");
    expect(rateAgeLabel("2026-10-06T11:59:40Z", now)).toBe("just now");
    expect(rateAgeLabel("2026-10-06T11:00:00Z", now)).toBe("1 hour ago");
    expect(rateAgeLabel("2026-10-04T12:00:00Z", now)).toBe("2 days ago");
  });
  it("calls rates stale after a week, or when there are none", () => {
    expect(ratesAreStale(null, now)).toBe(true);
    expect(ratesAreStale("2026-10-05T12:00:00Z", now)).toBe(false);
    expect(ratesAreStale("2026-09-20T12:00:00Z", now)).toBe(true);
  });
});
