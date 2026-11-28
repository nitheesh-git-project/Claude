import { describe, expect, it } from "vitest";
import { MIN_PUBLIC_RATINGS, ratingCountLabel } from "./publicRatings";

describe("publicRatings", () => {
  it("says 1 rating, not 1 ratings", () => {
    expect(ratingCountLabel(1)).toBe("1 rating");
    expect(ratingCountLabel(2)).toBe("2 ratings");
    expect(ratingCountLabel(0)).toBe("0 ratings");
  });
  it("waits for more than one rating before showing an average", () => {
    expect(MIN_PUBLIC_RATINGS).toBeGreaterThan(1);
  });
});
