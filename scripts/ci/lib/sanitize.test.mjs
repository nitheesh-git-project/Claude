import { describe, expect, it } from "vitest";
import { sanitize, sanitizeDeep, truncate } from "./sanitize.mjs";

// Shapes only -- none of these is a real credential.
const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlLXZhbHVlLWhlcmU";

describe("sanitize", () => {
  const cases = [
    ["a JWT", `apikey header was ${JWT} ok`, JWT],
    ["a Supabase secret key", "key sb_secret_AbCdEfGhIjKlMnOp here", "sb_secret_AbCdEfGhIjKlMnOp"],
    ["a publishable key", "sb_publishable_AbCdEfGhIjKlMnOp", "sb_publishable_AbCdEfGhIjKlMnOp"],
    ["a Supabase PAT", "token sbp_0123456789abcdef0123456789abcdef", "sbp_0123456789abcdef"],
    ["a Razorpay key id", "rzp_test_AbCdEf123456 failed", "rzp_test_AbCdEf123456"],
    ["a live Razorpay key id", "rzp_live_AbCdEf123456", "rzp_live_AbCdEf123456"],
    ["a secret assignment", "RAZORPAY_KEY_SECRET=abcDEF123456xyz", "abcDEF123456xyz"],
    ["a quoted secret assignment", 'SUPABASE_SERVICE_ROLE_KEY="whatever-value"', "whatever-value"],
    ["a JSON password", '{"email":"qa.admin@example.test","password":"QaTest!2024pass"}', "QaTest!2024pass"],
    ["a razorpay signature", '{"razorpay_signature":"abc123def456"}', "abc123def456"],
    ["a Bearer header", "Authorization: Bearer abc.def.ghi-jkl_mno", "abc.def.ghi-jkl_mno"],
    ["a cookie header", "cookie: sb-127-auth-token=base64-eyJzZXNzaW9u; other=1", "base64-eyJzZXNzaW9u"],
    ["an auth-token cookie inline", "sb-abcd-auth-token.0=base64-xyz123;", "base64-xyz123"],
    ["a signed storage URL", "http://127.0.0.1:54321/storage/v1/object/sign/medical-reports/a.pdf?token=eyJxyz.abc.def", "token=eyJxyz"],
    ["a Google refresh token", "1//0gFAKEfakeFAKEfakeFAKEfakeFAKE-xyz", "1//0gFAKEfakeFAKEfakeFAKEfake"],
    ["a Google access token", "ya29.a0AfH6SMBexampleexample", "ya29.a0AfH6SMB"],
    ["a Google client secret", "GOCSPX-abcdefghijklmnop", "GOCSPX-abcdefghijklmnop"],
    ["a DB password", "postgresql://postgres:s3cr%40t@db.example.co:5432/postgres", "s3cr%40t"],
    ["a real-looking email", "sent to someone@gmail.com", "someone@gmail.com"],
    ["an Indian mobile", "call +91 98765 43210 now", "98765 43210"],
  ];
  for (const [what, input, secret] of cases) {
    it(`removes ${what}`, () => {
      const out = sanitize(input);
      expect(out).not.toContain(secret);
      expect(out).toMatch(/REDACTED/);
    });
  }

  it("keeps fixture addresses, test ids and ordinary text readable", () => {
    const text = "REF-001 failed for qa.patient.a@example.test at 2026-10-05T05:53:45Z: expected 409, got 200";
    expect(sanitize(text)).toBe(text);
  });

  it("does not mangle UUIDs or paise amounts", () => {
    const text = "appointment 9f1c2a3b-6789-4abc-9def-987654321012 owes 9876543210 paise? no: 150000";
    expect(sanitize(text)).toContain("9f1c2a3b-6789-4abc-9def-987654321012");
  });

  it("passes null and undefined through", () => {
    expect(sanitize(null)).toBeNull();
    expect(sanitize(undefined)).toBeUndefined();
  });

  it("sanitises every string in a nested value", () => {
    const out = sanitizeDeep({ a: [`x ${JWT}`], b: { c: "RAZORPAY_KEY_SECRET=zzzzzzzz" }, n: 3 });
    expect(JSON.stringify(out)).not.toContain(JWT);
    expect(JSON.stringify(out)).not.toContain("zzzzzzzz");
    expect(out.n).toBe(3);
  });

  it("bounds a runaway string", () => {
    const out = truncate("x".repeat(5000), 100);
    expect(out.length).toBeLessThan(200);
    expect(out).toContain("truncated 4900");
  });
});
