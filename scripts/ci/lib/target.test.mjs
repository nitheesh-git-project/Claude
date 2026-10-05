import { describe, expect, it } from "vitest";
import { assessTarget, hostOf, isLoopbackHost, isPlaceholderRazorpayKey } from "./target.mjs";

// A target that is entirely safe and has working test keys.
const REAL_TEST_KEY = "rzp_test_Ab12Cd34Ef56Gh";
function local(overrides = {}) {
  return {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    E2E_BASE_URL: "http://localhost:3000",
    NEXT_PUBLIC_RAZORPAY_KEY_ID: REAL_TEST_KEY,
    RAZORPAY_KEY_SECRET: "secretsecretsecret",
    ...overrides,
  };
}
const GOOD_PROBE = { nonFixtureUsers: 0, markerPresent: true };
const codes = (result) => result.reasons.map((r) => r.code);

describe("assessTarget: the safe case", () => {
  it("passes a loopback stack with test keys and a clean, marked database", () => {
    const result = assessTarget(local(), GOOD_PROBE);
    expect(result).toEqual({ ok: true, unsafe: false, blocked: false, reasons: [] });
  });

  it("accepts localhost and ::1 as loopback", () => {
    expect(assessTarget(local({ NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" }), GOOD_PROBE).ok).toBe(true);
    expect(assessTarget(local({ DATABASE_URL: "postgresql://u:p@[::1]:5432/db" }), GOOD_PROBE).ok).toBe(true);
  });
});

describe("assessTarget: unsafe targets are refused", () => {
  it("rejects a hosted Supabase URL, naming it", () => {
    const result = assessTarget(local({ NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co" }), undefined);
    expect(result.unsafe).toBe(true);
    expect(codes(result)).toContain("supabase-url-not-loopback");
    expect(result.reasons[0].message).toMatch(/hosted Supabase/);
  });

  it("rejects an unknown non-loopback host and a lookalike", () => {
    expect(codes(assessTarget(local({ NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com" }), undefined))).toContain(
      "supabase-url-not-loopback"
    );
    // 127.0.0.1.evil.com is not loopback.
    expect(
      codes(assessTarget(local({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1.evil.com:54321" }), undefined))
    ).toContain("supabase-url-not-loopback");
  });

  it("rejects a missing or unparseable Supabase URL rather than assuming local", () => {
    expect(codes(assessTarget(local({ NEXT_PUBLIC_SUPABASE_URL: "" }), undefined))).toContain("supabase-url-missing");
    expect(codes(assessTarget(local({ NEXT_PUBLIC_SUPABASE_URL: "not a url" }), undefined))).toContain(
      "supabase-url-unparseable"
    );
  });

  it("rejects a hosted DATABASE_URL, a missing one, and a hosted app URL", () => {
    expect(
      codes(assessTarget(local({ DATABASE_URL: "postgresql://postgres:x@db.abcdefgh.supabase.co:5432/postgres" }), undefined))
    ).toContain("database-url-not-loopback");
    expect(codes(assessTarget(local({ DATABASE_URL: undefined }), undefined))).toContain("database-url-missing");
    expect(codes(assessTarget(local({ E2E_BASE_URL: "https://moverestore.example" }), undefined))).toContain(
      "base-url-not-loopback"
    );
    expect(codes(assessTarget(local({ E2E_LOGIN_BASE_URL: "https://moverestore.example" }), undefined))).toContain(
      "login-url-not-loopback"
    );
  });

  it("rejects a live Razorpay key wherever it appears", () => {
    for (const name of ["NEXT_PUBLIC_RAZORPAY_KEY_ID", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"]) {
      const result = assessTarget(local({ [name]: "rzp_live_Ab12Cd34Ef56Gh" }), GOOD_PROBE);
      expect(result.unsafe, name).toBe(true);
      expect(codes(result), name).toContain("razorpay-live-key");
    }
  });

  it("rejects a Razorpay key id that is not recognisably a test key", () => {
    expect(codes(assessTarget(local({ NEXT_PUBLIC_RAZORPAY_KEY_ID: "AKIAxxxxxxxx" }), GOOD_PROBE))).toContain(
      "razorpay-key-unrecognised"
    );
  });

  it("rejects Google Calendar credentials", () => {
    const result = assessTarget(local({ GOOGLE_CALENDAR_REFRESH_TOKEN: "1//abc", GOOGLE_CALENDAR_ID: "x@group" }), GOOD_PROBE);
    expect(result.unsafe).toBe(true);
    expect(result.reasons.find((r) => r.code === "google-calendar-configured").message).toMatch(
      /GOOGLE_CALENDAR_REFRESH_TOKEN, GOOGLE_CALENDAR_ID/
    );
    // Present-but-empty (how .env.example ships them) is fine.
    expect(assessTarget(local({ GOOGLE_CALENDAR_ID: "" }), GOOD_PROBE).ok).toBe(true);
  });

  it("rejects an armed data reset", () => {
    expect(codes(assessTarget(local({ ALLOW_DEBUG_DATA_RESET: "true" }), GOOD_PROBE))).toContain("reset-armed");
    expect(assessTarget(local({ ALLOW_DEBUG_DATA_RESET: "" }), GOOD_PROBE).ok).toBe(true);
  });

  it("rejects a Management API token in the environment", () => {
    expect(codes(assessTarget(local({ SUPABASE_ACCESS_TOKEN: "sbp_abc" }), GOOD_PROBE))).toContain(
      "management-token-present"
    );
  });

  it("rejects missing Supabase keys", () => {
    expect(codes(assessTarget(local({ SUPABASE_SERVICE_ROLE_KEY: "" }), GOOD_PROBE))).toContain("supabase-key-missing");
  });
});

describe("assessTarget: the database probe", () => {
  it("rejects a database holding a user who is not a fixture", () => {
    const result = assessTarget(local(), { nonFixtureUsers: 3, markerPresent: true });
    expect(result.unsafe).toBe(true);
    expect(result.reasons[0].message).toMatch(/3 auth user\(s\) are not @example.test/);
  });

  it("rejects a database the gate did not create, whatever it holds", () => {
    expect(codes(assessTarget(local(), { nonFixtureUsers: 0, markerPresent: false }))).toContain("marker-missing");
  });

  it("treats a probe that could not run as unsafe, not as clean", () => {
    expect(codes(assessTarget(local(), null))).toContain("probe-failed");
  });

  it("treats a probe that answered half a question as unsafe", () => {
    expect(codes(assessTarget(local(), { markerPresent: true }))).toContain("probe-incomplete");
  });

  it("does not probe-check when no probe was attempted yet (static phase)", () => {
    expect(assessTarget(local(), undefined).ok).toBe(true);
  });
});

describe("assessTarget: Razorpay keys missing is BLOCKED, not unsafe", () => {
  it.each([
    ["absent", { NEXT_PUBLIC_RAZORPAY_KEY_ID: undefined, RAZORPAY_KEY_SECRET: undefined }],
    ["empty", { NEXT_PUBLIC_RAZORPAY_KEY_ID: "", RAZORPAY_KEY_SECRET: "" }],
    ["placeholder id", { NEXT_PUBLIC_RAZORPAY_KEY_ID: "rzp_test_placeholder" }],
    ["placeholder secret", { RAZORPAY_KEY_SECRET: "placeholder" }],
  ])("%s", (_name, overrides) => {
    const result = assessTarget(local(overrides), GOOD_PROBE);
    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.unsafe).toBe(false);
    expect(codes(result)).toEqual(["razorpay-test-keys-missing"]);
  });

  it("does not require keys for a run that needs no provider", () => {
    const result = assessTarget(local({ NEXT_PUBLIC_RAZORPAY_KEY_ID: undefined, RAZORPAY_KEY_SECRET: undefined }), GOOD_PROBE, {
      requireRazorpay: false,
    });
    expect(result.ok).toBe(true);
  });

  it("still refuses a live key when keys are not required", () => {
    expect(
      assessTarget(local({ NEXT_PUBLIC_RAZORPAY_KEY_ID: "rzp_live_Ab12Cd34Ef56Gh" }), GOOD_PROBE, { requireRazorpay: false }).unsafe
    ).toBe(true);
  });
});

describe("helpers", () => {
  it("parses hosts", () => {
    expect(hostOf("http://LOCALHOST:3000/x")).toBe("localhost");
    expect(hostOf("postgresql://u:p@127.0.0.1:5432/db")).toBe("127.0.0.1");
    expect(hostOf("")).toBeNull();
    expect(hostOf(undefined)).toBeNull();
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("10.0.0.1")).toBe(false);
  });

  it("tells a placeholder key from a real-looking test key", () => {
    expect(isPlaceholderRazorpayKey("rzp_test_placeholder")).toBe(true);
    expect(isPlaceholderRazorpayKey("rzp_test_")).toBe(true);
    expect(isPlaceholderRazorpayKey(undefined)).toBe(true);
    expect(isPlaceholderRazorpayKey("rzp_test_Ab12Cd34Ef56Gh")).toBe(false);
  });
});
