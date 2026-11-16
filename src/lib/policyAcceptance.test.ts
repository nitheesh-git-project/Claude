import { describe, expect, it } from "vitest";
import {
  ACCEPTED_TERMS_METADATA_KEY,
  currentTermsVersion,
  isMinor,
  isValidPolicyVersion,
  latestTermsVersion,
  needsTermsAcceptance,
  signupTermsMetadata,
} from "./policyAcceptance";
import { LEGAL_FACTS } from "./legal/legalFacts";

describe("currentTermsVersion", () => {
  it("is the legal pages' effective date, so moving that date asks everyone again", () => {
    expect(currentTermsVersion()).toBe(LEGAL_FACTS.effectiveDate);
    expect(isValidPolicyVersion(currentTermsVersion())).toBe(true);
  });
});

describe("signupTermsMetadata", () => {
  it("carries the version under the key the database trigger reads", () => {
    expect(signupTermsMetadata("2026-11-12")).toEqual({ [ACCEPTED_TERMS_METADATA_KEY]: "2026-11-12" });
    expect(ACCEPTED_TERMS_METADATA_KEY).toBe("accepted_terms_version");
  });
});

describe("needsTermsAcceptance", () => {
  it("asks someone with no agreement, or an older one", () => {
    expect(needsTermsAcceptance(null, "2026-11-12")).toBe(true);
    expect(needsTermsAcceptance("2026-01-01", "2026-11-12")).toBe(true);
    expect(needsTermsAcceptance("2026-11-12", "2026-11-12")).toBe(false);
  });
  it("never locks anyone out when the read failed", () => {
    expect(needsTermsAcceptance(undefined, "2026-11-12")).toBe(false);
  });
});

describe("latestTermsVersion", () => {
  it("takes the newest terms row and ignores booking consents", () => {
    expect(
      latestTermsVersion([
        { document: "terms_privacy", version: "2026-01-01", accepted_at: "2026-01-02T00:00:00Z" },
        { document: "telehealth_consent", version: "2027-01-01", accepted_at: "2027-01-02T00:00:00Z" },
        { document: "terms_privacy", version: "2026-11-12", accepted_at: "2026-11-13T00:00:00Z" },
      ])
    ).toBe("2026-11-12");
    expect(latestTermsVersion([])).toBeNull();
  });
});

describe("isValidPolicyVersion / isMinor", () => {
  it("accepts a date-like token only", () => {
    expect(isValidPolicyVersion("2026-11-12")).toBe(true);
    expect(isValidPolicyVersion("<x>")).toBe(false);
    expect(isValidPolicyVersion("")).toBe(false);
  });
  it("is under 18", () => {
    expect(isMinor(17)).toBe(true);
    expect(isMinor(18)).toBe(false);
    expect(isMinor(null)).toBe(false);
  });
});
