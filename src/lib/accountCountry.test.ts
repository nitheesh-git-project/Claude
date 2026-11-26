import { describe, it, expect } from "vitest";
import { countryFromStoredPhone } from "./accountCountry";
import { resolveCountry } from "./countryPricing";

describe("a patient's own country", () => {
  it("reads the calling code of a stored number", () => {
    expect(countryFromStoredPhone("+919876543210")).toBe("IN");
    expect(countryFromStoredPhone("+12025550123")).toBe("US");
    expect(countryFromStoredPhone("+96891234567")).toBe("OM");
  });

  it("treats a legacy bare number as Indian, and nothing as unknown", () => {
    expect(countryFromStoredPhone("9876543210")).toBe("IN");
    expect(countryFromStoredPhone("")).toBeNull();
    expect(countryFromStoredPhone(null)).toBeNull();
  });
});

describe("which country a booking is priced for", () => {
  it("prices an Indian account in rupees even from a US connection", () => {
    expect(resolveCountry({ account: "IN", chosen: null, detected: "US", pickerAllowed: true })).toBe("IN");
  });

  it("lets the account win over the visitor's own pick", () => {
    expect(resolveCountry({ account: "IN", chosen: "US", detected: "US", pickerAllowed: true })).toBe("IN");
  });

  it("falls back to the request's rule when the account says nothing usable", () => {
    expect(resolveCountry({ account: null, chosen: null, detected: "US", pickerAllowed: true })).toBe("US");
    expect(resolveCountry({ account: "ZZ", chosen: "GB", detected: "US", pickerAllowed: true })).toBe("GB");
  });
});
