import { describe, expect, it } from "vitest";
import { payLaterDuePaise, rupeesInputValue } from "./payLaterDue";

describe("payLaterDuePaise", () => {
  it("rounds a total with paise down to the rupee", () => {
    expect(payLaterDuePaise(105_918)).toBe(105_900);
    expect(payLaterDuePaise(105_999)).toBe(105_900);
  });
  it("leaves whole rupees alone", () => {
    expect(payLaterDuePaise(105_900)).toBe(105_900);
  });
  it("never rounds a small total to nothing, and refuses nonsense", () => {
    expect(payLaterDuePaise(50)).toBe(50);
    expect(payLaterDuePaise(0)).toBe(0);
    expect(payLaterDuePaise(Number.NaN)).toBe(0);
  });
});

describe("rupeesInputValue", () => {
  it("keeps paise instead of rounding them away", () => {
    expect(rupeesInputValue(105_918)).toBe("1059.18");
    expect(rupeesInputValue(18)).toBe("0.18");
  });
  it("prints whole rupees without decimals", () => {
    expect(rupeesInputValue(105_900)).toBe("1059");
  });
});
