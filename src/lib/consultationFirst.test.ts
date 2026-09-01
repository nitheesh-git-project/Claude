import { describe, it, expect } from "vitest";
import {
  isDirectlyPurchasable,
  CONSULTATION_SESSION_COUNT,
  PROGRAMME_NEEDS_RECOMMENDATION,
} from "@/lib/consultationFirst";

describe("consultationFirst", () => {
  it("sells a single session or visit directly", () => {
    expect(isDirectlyPurchasable(1)).toBe(true);
    expect(CONSULTATION_SESSION_COUNT).toBe(1);
  });

  it("refuses anything larger, whatever the size", () => {
    for (const n of [2, 3, 4, 6, 12, 100]) {
      expect(isDirectlyPurchasable(n)).toBe(false);
    }
  });

  it("refuses a count it cannot read", () => {
    // A missing count must never fall through as sellable -- the failure
    // direction has to be "ask a therapist", not "charge them".
    expect(isDirectlyPurchasable(null)).toBe(false);
    expect(isDirectlyPurchasable(undefined)).toBe(false);
    expect(isDirectlyPurchasable(NaN)).toBe(false);
    expect(isDirectlyPurchasable("6" as unknown as number)).toBe(false);
  });

  it("explains itself in a patient's words, not a developer's", () => {
    expect(PROGRAMME_NEEDS_RECOMMENDATION).toMatch(/therapist/i);
    expect(PROGRAMME_NEEDS_RECOMMENDATION).not.toMatch(/error|forbidden|403/i);
  });
});
