import { describe, expect, it } from "vitest";
import { validateProfileChanges } from "@/lib/profileChangeValidation";

const NOW = Date.parse("2026-10-01T00:00:00Z");

describe("validateProfileChanges", () => {
  it("normalises good values", () => {
    expect(
      validateProfileChanges(
        { full_name: "  Asha Rao ", years_experience: "7", specialization: "orthopaedic", gender: "Female" },
        NOW
      )
    ).toEqual({
      ok: true,
      values: { full_name: "Asha Rao", years_experience: 7, specialization: "Orthopaedic", gender: "Female" },
    });
  });

  it("refuses negative, fractional and absurd experience", () => {
    for (const bad of [-1, 2.5, 200, "lots"]) {
      expect(validateProfileChanges({ years_experience: bad }, NOW).ok).toBe(false);
    }
  });

  it("refuses an empty name and an oversized credentials string", () => {
    expect(validateProfileChanges({ full_name: " " }, NOW).ok).toBe(false);
    expect(validateProfileChanges({ organization_name: "" }, NOW).ok).toBe(false);
    expect(validateProfileChanges({ credentials: "x".repeat(301) }, NOW).ok).toBe(false);
  });

  it("refuses a specialty the clinic does not offer", () => {
    expect(validateProfileChanges({ specialization: "Reiki master" }, NOW).ok).toBe(false);
  });

  it("refuses a malformed phone and an impossible date of birth", () => {
    expect(validateProfileChanges({ phone: "12" }, NOW).ok).toBe(false);
    expect(validateProfileChanges({ date_of_birth: "2027-01-01" }, NOW).ok).toBe(false);
    expect(validateProfileChanges({ date_of_birth: "1990-02-30" }, NOW).ok).toBe(false);
  });

  it("refuses an unknown field and an unlisted gender", () => {
    expect(validateProfileChanges({ role: "admin" }, NOW).ok).toBe(false);
    expect(validateProfileChanges({ gender: "Robot" }, NOW).ok).toBe(false);
  });
});
