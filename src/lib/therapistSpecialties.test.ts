import { describe, expect, it } from "vitest";
import {
  MAX_SPECIALTY_LENGTH,
  SPECIALTY_FILTER_ALL,
  SPECIALTY_FILTER_NONE,
  SPECIALTY_FILTER_OTHER,
  THERAPIST_SPECIALTIES,
  matchesSpecialtyFilter,
  normalizeSpecialty,
  specialtyChipClass,
  specialtyFilterOptions,
  specialtyLabel,
  storableSpecialty,
} from "./therapistSpecialties";

describe("normalizeSpecialty", () => {
  it("recognises the canonical labels it stores", () => {
    for (const spec of THERAPIST_SPECIALTIES) {
      expect(normalizeSpecialty(spec.label)).toBe(spec.key);
    }
  });

  it("recognises the shorthand and the American spellings therapists already wrote", () => {
    expect(normalizeSpecialty("ortho")).toBe("orthopaedic");
    expect(normalizeSpecialty("Orthopedics")).toBe("orthopaedic");
    expect(normalizeSpecialty("neuro-rehab")).toBe("neurological");
    expect(normalizeSpecialty("Pediatric")).toBe("paediatric");
    expect(normalizeSpecialty("  Sports  ")).toBe("sports");
    expect(normalizeSpecialty("Women's Health")).toBe("womens_health");
  });

  it("is null for blank and for anything it does not know", () => {
    expect(normalizeSpecialty(null)).toBeNull();
    expect(normalizeSpecialty(undefined)).toBeNull();
    expect(normalizeSpecialty("   ")).toBeNull();
    expect(normalizeSpecialty("Dry needling and taping")).toBeNull();
  });
});

describe("specialtyLabel", () => {
  it("prints the canonical label for a value it recognises", () => {
    expect(specialtyLabel("neuro")).toBe("Neurological");
  });

  it("prints free text exactly as it was written", () => {
    expect(specialtyLabel("  Dry needling ")).toBe("Dry needling");
  });

  // A therapist who has not said is not "Unknown" -- a chip saying so on
  // every profile is noise, so the caller is told to print nothing.
  it("is null when nobody has said", () => {
    expect(specialtyLabel("")).toBeNull();
    expect(specialtyLabel(null)).toBeNull();
  });
});

describe("specialtyChipClass", () => {
  it("gives free text the neutral chip rather than no chip", () => {
    expect(specialtyChipClass("Dry needling")).toContain("slate");
    expect(specialtyChipClass("ortho")).toContain("teal");
  });
});

describe("matchesSpecialtyFilter", () => {
  it("passes everything for the all bucket", () => {
    expect(matchesSpecialtyFilter(null, SPECIALTY_FILTER_ALL)).toBe(true);
    expect(matchesSpecialtyFilter("anything", SPECIALTY_FILTER_ALL)).toBe(true);
  });

  it("matches a recognised value however it was spelled", () => {
    expect(matchesSpecialtyFilter("Orthopedic", "orthopaedic")).toBe(true);
    expect(matchesSpecialtyFilter("Neurological", "orthopaedic")).toBe(false);
  });

  it("keeps free text and nothing-at-all in separate buckets", () => {
    expect(matchesSpecialtyFilter("Dry needling", SPECIALTY_FILTER_OTHER)).toBe(true);
    expect(matchesSpecialtyFilter("Dry needling", SPECIALTY_FILTER_NONE)).toBe(false);
    expect(matchesSpecialtyFilter(null, SPECIALTY_FILTER_NONE)).toBe(true);
    expect(matchesSpecialtyFilter(null, SPECIALTY_FILTER_OTHER)).toBe(false);
  });
});

describe("specialtyFilterOptions", () => {
  it("offers only the specialties somebody on screen actually has", () => {
    const options = specialtyFilterOptions(["ortho", "Orthopaedic", "neuro"]);
    expect(options.map((o) => o.value)).toEqual([
      SPECIALTY_FILTER_ALL,
      "orthopaedic",
      "neurological",
    ]);
    expect(options[1].count).toBe(2);
    expect(options[0].count).toBe(3);
  });

  it("adds the two buckets only when they hold somebody", () => {
    const none = specialtyFilterOptions(["ortho"]);
    expect(none.map((o) => o.value)).not.toContain(SPECIALTY_FILTER_NONE);

    const both = specialtyFilterOptions(["ortho", "Dry needling", null, ""]);
    const values = both.map((o) => o.value);
    expect(values).toContain(SPECIALTY_FILTER_OTHER);
    expect(values).toContain(SPECIALTY_FILTER_NONE);
    expect(both.find((o) => o.value === SPECIALTY_FILTER_NONE)?.count).toBe(2);
  });

  it("answers with just the all bucket for nobody", () => {
    expect(specialtyFilterOptions([]).map((o) => o.value)).toEqual([SPECIALTY_FILTER_ALL]);
  });
});

describe("storableSpecialty", () => {
  it("stores the canonical label whatever the picker sent", () => {
    expect(storableSpecialty("ortho")).toBe("Orthopaedic");
    expect(storableSpecialty("Orthopaedic")).toBe("Orthopaedic");
  });

  it("keeps free text, trimmed and capped", () => {
    expect(storableSpecialty("  Dry needling  ")).toBe("Dry needling");
    expect(storableSpecialty("x".repeat(200))).toHaveLength(MAX_SPECIALTY_LENGTH);
  });

  it("is null for blank", () => {
    expect(storableSpecialty("   ")).toBeNull();
    expect(storableSpecialty(undefined)).toBeNull();
  });
});
