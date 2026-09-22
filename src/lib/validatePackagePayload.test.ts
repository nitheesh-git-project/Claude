import { describe, expect, it } from "vitest";
import { validatePackagePayload } from "./validatePackagePayload";

const base = {
  title: "Knee rehab",
  priceInr: "4000",
  sessionCount: "4",
  displayOrder: "1",
};

describe("validatePackagePayload - sessions included", () => {
  it("takes a single-session package", () => {
    // The whole point of allowing one: a clinician recommending a single
    // follow-up had no way to express it while the floor was two.
    const result = validatePackagePayload(
      { ...base, sessionCount: "1" },
      { requireTitleAndPricing: true }
    );
    expect("error" in result).toBe(false);
    if (!("error" in result)) expect(result.columns.session_count).toBe(1);
  });

  it("still refuses none, a fraction and a negative", () => {
    for (const sessionCount of ["0", "-1", "1.5", "", "two"]) {
      const result = validatePackagePayload(
        { ...base, sessionCount },
        { requireTitleAndPricing: true }
      );
      expect("error" in result, `sessionCount=${sessionCount}`).toBe(true);
    }
  });

  it("says what an acceptable count is, not merely that this one is wrong", () => {
    const result = validatePackagePayload(
      { ...base, sessionCount: "0" },
      { requireTitleAndPricing: true }
    );
    expect("error" in result && result.error).toContain("1 or more");
  });
});

describe("validatePackagePayload - the switches that survive", () => {
  it("carries recommendable through", () => {
    const result = validatePackagePayload(
      { ...base, recommendable: false },
      { requireTitleAndPricing: true }
    );
    expect("error" in result).toBe(false);
    if (!("error" in result)) expect(result.columns.recommendable).toBe(false);
  });
});
