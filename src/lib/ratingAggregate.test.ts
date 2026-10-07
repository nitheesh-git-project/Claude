import { describe, expect, it } from "vitest";
import { computeRatingAggregate } from "./ratingAggregate";

describe("computeRatingAggregate", () => {
  it("averages the included ratings and counts the excluded ones apart", () => {
    const r = computeRatingAggregate([
      { rating: 5, excluded: false },
      { rating: 4, excluded: false },
      { rating: 1, excluded: true },
      { rating: null, excluded: false },
    ]);
    expect(r.average).toBe(4.5);
    expect(r.count).toBe(2);
    expect(r.excludedCount).toBe(1);
  });

  it("buckets the included ratings by star, so the bars add up to the count", () => {
    const r = computeRatingAggregate([
      { rating: 5, excluded: false },
      { rating: 5, excluded: false },
      { rating: 3, excluded: false },
      { rating: 2, excluded: true },
    ]);
    expect(r.distribution).toEqual([0, 0, 1, 0, 2]);
    expect(r.distribution.reduce((a, b) => a + b, 0)).toBe(r.count);
  });

  it("has no average and empty bars with nothing included", () => {
    const r = computeRatingAggregate([{ rating: 3, excluded: true }]);
    expect(r.average).toBeNull();
    expect(r.distribution).toEqual([0, 0, 0, 0, 0]);
  });
});
