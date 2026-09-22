import { describe, expect, it } from "vitest";
import { describeValidity, tidyFieldLabel } from "./formValidationMessage";

describe("describeValidity", () => {
  it("names the field it is about", () => {
    expect(describeValidity({ valueMissing: true, label: "Condition name" })).toBe(
      "Condition name needs filling in."
    );
  });

  it("falls back to a sentence that still reads, with no label", () => {
    expect(describeValidity({ valueMissing: true })).toBe("This field needs filling in.");
  });

  it("words a choice as a choice rather than as filling in", () => {
    expect(describeValidity({ valueMissing: true, tag: "select", label: "Therapist" })).toBe(
      "Choose therapist."
    );
    expect(describeValidity({ valueMissing: true, type: "checkbox", label: "I agree" })).toBe(
      "I agree needs ticking."
    );
    expect(describeValidity({ valueMissing: true, type: "date", label: "Session date" })).toBe(
      "Pick a date for session date."
    );
  });

  it("leaves a capitalised name alone when the sentence starts with a verb", () => {
    // Lower-casing the first letter of WhatsApp reads as a typo, where
    // lower-casing "Therapist" does not.
    expect(describeValidity({ valueMissing: true, tag: "select", label: "WhatsApp number" })).toBe(
      "Choose WhatsApp number."
    );
  });

  it("says what an acceptable value would look like", () => {
    expect(describeValidity({ typeMismatch: true, type: "email", label: "Email" })).toBe(
      "Email has to be an email address, like name@example.com."
    );
    expect(describeValidity({ tooShort: true, minLength: 10, label: "Reason" })).toBe(
      "Reason has to be at least 10 characters long."
    );
    expect(describeValidity({ tooLong: true, maxLength: 1, label: "Initial" })).toBe(
      "Initial has to be 1 character or fewer."
    );
    expect(describeValidity({ rangeUnderflow: true, min: "1", label: "Sessions" })).toBe(
      "Sessions has to be 1 or more."
    );
    expect(describeValidity({ rangeOverflow: true, max: "100", label: "Share" })).toBe(
      "Share has to be 100 or less."
    );
    expect(describeValidity({ stepMismatch: true, step: "1", label: "Sessions" })).toBe(
      "Sessions has to be a whole number."
    );
  });

  it("uses the page's own explanation of a pattern where it wrote one", () => {
    expect(
      describeValidity({
        patternMismatch: true,
        label: "Code",
        title: "Use letters and numbers only, no spaces.",
      })
    ).toBe("Use letters and numbers only, no spaces.");
  });

  it("lets a message the app set itself win outright", () => {
    // setCustomValidity means a form knew something this module cannot.
    expect(
      describeValidity({
        customError: "That code has already been used.",
        valueMissing: true,
        label: "Code",
      })
    ).toBe("That code has already been used.");
  });

  it("never returns an empty sentence, whatever it was handed", () => {
    expect(describeValidity({})).toBe("This field needs checking.");
    expect(describeValidity({ tag: "select" })).toBe("This field needs a different choice.");
    // A refusal whose bound the browser did not expose must not print
    // "undefined" at somebody.
    expect(describeValidity({ tooShort: true, label: "Reason" })).not.toContain("undefined");
    expect(describeValidity({ rangeUnderflow: true, label: "Sessions" })).not.toContain("undefined");
  });
});

describe("tidyFieldLabel", () => {
  it("drops the markers a label carries that the message would repeat", () => {
    expect(tidyFieldLabel("Condition name *")).toBe("Condition name");
    expect(tidyFieldLabel("Email:")).toBe("Email");
    expect(tidyFieldLabel("Reason (required)")).toBe("Reason");
    expect(tidyFieldLabel("  Travel\n  fee  ")).toBe("Travel fee");
  });

  it("refuses help text dressed as a label", () => {
    expect(tidyFieldLabel("a".repeat(61))).toBeUndefined();
    expect(tidyFieldLabel("   ")).toBeUndefined();
    expect(tidyFieldLabel(null)).toBeUndefined();
  });
});
