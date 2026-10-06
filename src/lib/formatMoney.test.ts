import { describe, expect, it } from "vitest";
import { formatInr, formatRupees } from "./formatMoney";

describe("formatRupees", () => {
  it("prints whole rupees without decimals", () => {
    expect(formatInr(49900)).toBe("₹499");
    expect(formatInr(29199900)).toBe("₹2,91,999");
  });
  it("always prints two decimals when there are paise", () => {
    expect(formatInr(311880)).toBe("₹3,118.80");
    expect(formatInr(191940)).toBe("₹1,919.40");
    expect(formatInr(297826)).toBe("₹2,978.26");
  });
  it("keeps the sign of a negative amount", () => {
    expect(formatRupees(-311880)).toBe("-3,118.80");
  });
  it("treats a non-number as zero rather than printing NaN", () => {
    expect(formatInr(Number.NaN)).toBe("₹0");
  });
});
