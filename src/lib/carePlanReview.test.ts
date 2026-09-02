import { describe, it, expect } from "vitest";
import { validateReviewReason, MIN_REVIEW_REASON_LENGTH } from "@/lib/carePlanReview";

describe("validateReviewReason", () => {
  it("refuses a reason shorter than the CHECK on the column", () => {
    // Refused here as well as in the database so an admin is told before
    // they have retyped a decision, rather than by a raw constraint error.
    expect(validateReviewReason("no").ok).toBe(false);
    expect(validateReviewReason("x".repeat(MIN_REVIEW_REASON_LENGTH - 1)).ok).toBe(false);
  });

  it("refuses whitespace padded out to the minimum", () => {
    // btrim in the CHECK, trim here. Without the trim, ten spaces would
    // pass this and then fail the insert.
    expect(validateReviewReason("   ok     ").ok).toBe(false);
  });

  it("accepts a real sentence", () => {
    expect(validateReviewReason("Matches the assessment findings.").ok).toBe(true);
  });
});
