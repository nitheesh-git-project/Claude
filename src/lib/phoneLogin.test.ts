import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  NEUTRAL_SENT,
  cleanOtp,
  decideSend,
  decodeJwtClaims,
  parsePhoneLoginControls,
  roleMayUsePhone,
  sessionUsedOtp,
  toE164,
} from "@/lib/phoneLogin";

function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "HS256" })}.${b64(claims)}.signature`;
}

describe("who may sign in with a phone code", () => {
  it("is patients, therapists and hospitals -- never an admin", () => {
    for (const r of ["patient", "therapist", "hospital"]) expect(roleMayUsePhone(r), r).toBe(true);
    for (const r of ["admin", "", null, "superuser"]) expect(roleMayUsePhone(r), String(r)).toBe(false);
  });

  it("texts a code only to an active account that may use it", () => {
    expect(decideSend({ role: "patient", active: true })).toEqual({ send: true });
    expect(decideSend({ role: "hospital", active: null })).toEqual({ send: true });
    expect(decideSend({ role: "admin", active: true })).toEqual({ send: false, reason: "admin" });
    expect(decideSend({ role: "therapist", active: false })).toEqual({ send: false, reason: "inactive" });
    expect(decideSend(null)).toEqual({ send: false, reason: "no_account" });
  });

  it("answers every case with the same sentence, which never says whether there is an account", () => {
    expect(NEUTRAL_SENT).toMatch(/^If this number is linked to an account/);
    const route = readFileSync("src/app/api/auth/phone/send/route.ts", "utf8");
    // One success response, after the decision, whatever it was.
    expect(route.match(/NextResponse\.json\(\{ sent: true/g)?.length).toBe(1);
    expect(route).toContain("shouldCreateUser: false");
  });
});

describe("numbers and codes", () => {
  it("normalises to E.164", () => {
    expect(toE164("+91 98765 43210")).toBe("+919876543210");
    expect(toE164("9876543210")).toBe("+919876543210");
    expect(toE164("call me")).toBeNull();
  });
  it("takes six digits only", () => {
    expect(cleanOtp(" 123 456 ")).toBe("123456");
    for (const v of ["12345", "1234567", "abcdef", null]) expect(cleanOtp(v), String(v)).toBeNull();
  });
});

describe("the admin guard's check", () => {
  it("spots a session started with a one-time code", () => {
    expect(sessionUsedOtp([{ method: "otp", timestamp: 1 }])).toBe(true);
    expect(sessionUsedOtp([{ method: "password", timestamp: 1 }])).toBe(false);
    expect(sessionUsedOtp([{ method: "recovery", timestamp: 1 }])).toBe(false);
    expect(sessionUsedOtp(["otp"])).toBe(true);
    // Unreadable is "not": refusing every admin on a malformed token would
    // lock the clinic out of its own back office.
    expect(sessionUsedOtp(undefined)).toBe(false);
  });

  it("reads the claims of a token", () => {
    expect(decodeJwtClaims(jwt({ amr: [{ method: "otp" }], sub: "u" }))?.amr).toEqual([{ method: "otp" }]);
    expect(decodeJwtClaims("not.a")).toBeNull();
    expect(decodeJwtClaims(null)).toBeNull();
  });

  it("is wired into requireAdmin", () => {
    const guard = readFileSync("src/lib/supabase/requireAdmin.ts", "utf8");
    expect(guard).toContain("sessionUsedOtp(decodeJwtClaims(");
  });
});

describe("the switch", () => {
  it("starts off", () => {
    expect(parsePhoneLoginControls(null)).toEqual({ enabled: false });
    expect(parsePhoneLoginControls({ enabled: true })).toEqual({ enabled: true });
  });
});
