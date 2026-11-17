import { describe, expect, it } from "vitest";
import { makeTrustedCode, normalizeTrustedCode, trustedCodeMatches, validateTrustedCodeInput } from "@/lib/trustedPatientCode";

describe("trusted-patient codes", () => {
  it("makes a readable code and forgives how one is typed", () => {
    const code = makeTrustedCode(() => [0, 1, 2, 3, 4, 5]);
    expect(code).toMatch(/^TRUST-[A-Z0-9]{6}$/);
    expect(code).not.toMatch(/[01OI]/);
    expect(normalizeTrustedCode(" trust-ab2cd3 ")).toBe("TRUST-AB2CD3");
    expect(normalizeTrustedCode("ab2cd3")).toBe("TRUST-AB2CD3");
    expect(normalizeTrustedCode("TRUST-AB2")).toBeNull();
    expect(normalizeTrustedCode(42)).toBeNull();
  });

  it("needs a name, a real reason, and an email or phone to lock it to", () => {
    const base = { patientName: "Ram", reason: "Long-standing patient of Dr Rao", email: "ram@example.com" };
    expect(validateTrustedCodeInput(base).ok).toBe(true);
    expect(validateTrustedCodeInput({ ...base, reason: "short" }).ok).toBe(false);
    expect(validateTrustedCodeInput({ ...base, patientName: " " }).ok).toBe(false);
    expect(validateTrustedCodeInput({ ...base, email: "" }).ok).toBe(false);
    expect(validateTrustedCodeInput({ ...base, email: "", phone: "+91 98765 43210" }).ok).toBe(true);
    expect(validateTrustedCodeInput({ ...base, email: "nope" }).ok).toBe(false);
  });

  it("matches only the account it was made for", () => {
    const code = { match_email: "Ram@Example.com", match_phone: "+91 98765 43210" };
    expect(trustedCodeMatches(code, { email: "ram@example.com", phone: null })).toBe(true);
    expect(trustedCodeMatches(code, { email: "other@example.com", phone: "+919876543210" })).toBe(true);
    expect(trustedCodeMatches(code, { email: "other@example.com", phone: "+919999999999" })).toBe(false);
    expect(trustedCodeMatches({ match_email: null, match_phone: "+91 98765 43210" }, { email: null, phone: null })).toBe(false);
  });
});
