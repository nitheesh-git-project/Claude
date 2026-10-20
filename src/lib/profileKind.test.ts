import { describe, expect, it } from "vitest";
import { profileKindsForSpecialty } from "@/lib/outcomeMeasures";
import { NEURO_SUBTYPE_KEY, NEURO_SUBTYPE_PARKINSONS, profileKindFor } from "@/lib/profileKind";

describe("profileKindFor", () => {
  it("follows the recorded condition type", () => {
    expect(profileKindFor("ortho", {})).toBe("ortho");
    expect(profileKindFor("neuro", {})).toBe("neuro");
    expect(profileKindFor("pediatrics", {})).toBe("pediatrics");
    expect(profileKindFor("neuro", null)).toBe("neuro");
    expect(profileKindFor("ortho", undefined)).toBe("ortho");
  });

  it("makes a neurological record with the Parkinson's answer the Parkinson's sub-profile", () => {
    expect(profileKindFor("neuro", { [NEURO_SUBTYPE_KEY]: NEURO_SUBTYPE_PARKINSONS })).toBe("neuro_parkinsons");
    // The same answer typed with a curly apostrophe or stray spacing.
    expect(profileKindFor("neuro", { neuro_subtype: "  Parkinson’s   disease " })).toBe("neuro_parkinsons");
    expect(profileKindFor("neuro", { neuro_subtype: "parkinson's disease" })).toBe("neuro_parkinsons");
  });

  it("never makes anything else Parkinson's", () => {
    expect(profileKindFor("neuro", { neuro_subtype: "Stroke" })).toBe("neuro");
    expect(profileKindFor("neuro", { neuro_subtype: "Parkinson's" })).toBe("neuro");
    expect(profileKindFor("neuro", { neuro_subtype: 1 })).toBe("neuro");
    // The key on a non-neurological record is not a sub-profile of it.
    expect(profileKindFor("ortho", { neuro_subtype: NEURO_SUBTYPE_PARKINSONS })).toBe("ortho");
    expect(profileKindFor("pediatrics", { neuro_subtype: NEURO_SUBTYPE_PARKINSONS })).toBe("pediatrics");
  });

  it("only ever answers a kind the specialty can carry", () => {
    for (const specialty of ["ortho", "neuro", "pediatrics"] as const) {
      for (const data of [{}, { neuro_subtype: NEURO_SUBTYPE_PARKINSONS }]) {
        expect(profileKindsForSpecialty(specialty)).toContain(profileKindFor(specialty, data));
      }
    }
  });
});
