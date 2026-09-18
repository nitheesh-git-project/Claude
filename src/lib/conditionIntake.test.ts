import { describe, it, expect } from "vitest";
import { isSameIntakeSubmission } from "./conditionIntake";

const live = {
  specialty: "ortho" as const,
  status: "active",
  data: { pain_duration: "2 to 6 weeks", pain_worst: "Mornings" },
  triageData: { age_band: "18 to 64" },
};
const same = {
  specialty: "ortho" as const,
  data: { pain_duration: "2 to 6 weeks", pain_worst: "Mornings" },
  triageData: { age_band: "18 to 64" },
};

describe("isSameIntakeSubmission", () => {
  it("recognises the double-tap this exists for", () => {
    // Two callers claimed one onboarding -- one won the insert race, one won
    // the first update -- and the admin's Review History showed it twice.
    expect(isSameIntakeSubmission(live, same)).toBe(true);
  });

  it("is false when a clinical answer differs", () => {
    expect(
      isSameIntakeSubmission(live, {
        ...same,
        data: { ...same.data, pain_worst: "Evenings" },
      })
    ).toBe(false);
  });

  it("is false when the triage answers differ", () => {
    // Without this the record would silently keep the old triage answers:
    // treating a real change as a no-op loses a clinical field.
    expect(
      isSameIntakeSubmission(live, { ...same, triageData: { age_band: "65 or over" } })
    ).toBe(false);
  });

  it("is false for a re-triage to another condition type", () => {
    expect(isSameIntakeSubmission(live, { ...same, specialty: "neuro" })).toBe(false);
  });

  it("is false whenever the record is not live yet", () => {
    // A draft becoming active is exactly what onboarding does, so it must
    // never be mistaken for a no-op.
    for (const status of ["draft", "not_started", "pending"]) {
      expect(isSameIntakeSubmission({ ...live, status }, same)).toBe(false);
    }
  });

  it("treats a missing key and an empty string as the same absence", () => {
    // The merge writes "" for an unanswered question, so a record carrying
    // the key empty and a submission omitting it are the same submission.
    expect(
      isSameIntakeSubmission(
        { ...live, data: { ...live.data, notes: "" } },
        same
      )
    ).toBe(true);
  });

  it("is false when the submission drops an answer that was on file", () => {
    expect(
      isSameIntakeSubmission(
        { ...live, data: { ...live.data, notes: "Felt better after session 2" } },
        same
      )
    ).toBe(false);
  });
});
