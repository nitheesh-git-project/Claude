import { describe, it, expect } from "vitest";
import { validateReviewReason, MIN_REVIEW_REASON_LENGTH } from "@/lib/carePlanReview";

describe("validateReviewReason", () => {
  it("asks for nothing to say plain yes", () => {
    // The happy path through this queue is a patient hearing back, and
    // taxing it with a sentence meaning "fine" is how a reason column
    // fills up with "ok" and stops being worth reading. A plain
    // approval's evidence is who and when, both already on the row.
    expect(validateReviewReason("", "approved").ok).toBe(true);
  });

  it("refuses a rejection shorter than the CHECK on the column", () => {
    // Refused here as well as in the database so an admin is told before
    // they have retyped a decision, rather than by a raw constraint error.
    expect(validateReviewReason("no", "rejected").ok).toBe(false);
    expect(
      validateReviewReason("x".repeat(MIN_REVIEW_REASON_LENGTH - 1), "rejected").ok
    ).toBe(false);
  });

  it("refuses whitespace padded out to the minimum", () => {
    // btrim in the CHECK, trim here. Without the trim, ten spaces would
    // pass this and then fail the insert.
    expect(validateReviewReason("   ok     ", "rejected").ok).toBe(false);
  });

  it("requires one for an approval that changes the numbers", () => {
    // This one goes out under the clinician's name, so what the clinic
    // changed and why is the part worth having a month later.
    expect(validateReviewReason("", "edited_and_approved").ok).toBe(false);
    expect(
      validateReviewReason("Frequency reduced to what this patient can attend.", "edited_and_approved").ok
    ).toBe(true);
  });

  it("accepts a real sentence on a rejection", () => {
    expect(
      validateReviewReason("They still have four unused sessions.", "rejected").ok
    ).toBe(true);
  });
});
