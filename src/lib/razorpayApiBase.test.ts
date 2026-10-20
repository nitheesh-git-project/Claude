import { describe, expect, it } from "vitest";
import { isLoopbackHost, razorpayApiBaseOverride } from "./razorpayApiBase";

// The override sends a Razorpay key id and secret somewhere other than
// Razorpay, so most of these are about the ways it must refuse.

const TEST_KEY = { NEXT_PUBLIC_RAZORPAY_KEY_ID: "rzp_test_abc123" };

describe("razorpayApiBaseOverride", () => {
  it("uses Razorpay when nothing is set", () => {
    expect(razorpayApiBaseOverride({ ...TEST_KEY })).toEqual({ use: "razorpay", baseUrl: null, ignored: null });
    expect(razorpayApiBaseOverride({ ...TEST_KEY, RAZORPAY_API_BASE_URL: "   " })).toEqual({
      use: "razorpay",
      baseUrl: null,
      ignored: null,
    });
  });

  it("honours a loopback origin, without a trailing slash", () => {
    for (const raw of ["http://127.0.0.1:4010", "http://127.0.0.1:4010/", "http://localhost:4010", "http://[::1]:4010", "http://127.0.0.2:9"]) {
      const decision = razorpayApiBaseOverride({ ...TEST_KEY, RAZORPAY_API_BASE_URL: raw });
      expect(decision.use, raw).toBe("override");
      expect(decision.baseUrl, raw).toBe(new URL(raw).origin);
      expect(decision.baseUrl!.endsWith("/"), raw).toBe(false);
    }
  });

  it("refuses any host that is not loopback", () => {
    for (const raw of [
      "https://api.razorpay.com",
      "http://10.0.0.5:4010",
      "http://192.168.1.2",
      "http://fake-razorpay:4010",
      "http://127.0.0.1.attacker.example",
      "http://localhost.attacker.example",
      "http://0.0.0.0:4010",
    ]) {
      const decision = razorpayApiBaseOverride({ ...TEST_KEY, RAZORPAY_API_BASE_URL: raw });
      expect(decision.use, raw).toBe("razorpay");
      expect(decision.baseUrl, raw).toBeNull();
      expect(decision.ignored, raw).toMatch(/not a loopback host/);
    }
  });

  it("is ignored on a production deploy, even pointed at loopback", () => {
    const decision = razorpayApiBaseOverride({
      ...TEST_KEY,
      VERCEL_ENV: "production",
      RAZORPAY_API_BASE_URL: "http://127.0.0.1:4010",
    });
    expect(decision).toMatchObject({ use: "razorpay", baseUrl: null });
    expect(decision.ignored).toMatch(/production/);
  });

  it("still applies on a preview or development deploy", () => {
    for (const VERCEL_ENV of ["preview", "development", undefined]) {
      expect(
        razorpayApiBaseOverride({ ...TEST_KEY, VERCEL_ENV, RAZORPAY_API_BASE_URL: "http://127.0.0.1:4010" }).use
      ).toBe("override");
    }
  });

  it("never sends a live key anywhere but Razorpay", () => {
    for (const env of [
      { NEXT_PUBLIC_RAZORPAY_KEY_ID: "rzp_live_abc", RAZORPAY_API_BASE_URL: "http://127.0.0.1:4010" },
      { RAZORPAY_KEY_ID: " rzp_live_abc", RAZORPAY_API_BASE_URL: "http://127.0.0.1:4010" },
    ]) {
      const decision = razorpayApiBaseOverride(env);
      expect(decision.use).toBe("razorpay");
      expect(decision.ignored).toMatch(/live key/);
    }
  });

  it("refuses anything but a bare http(s) origin", () => {
    const cases: [string, RegExp][] = [
      ["not a url", /not a URL/],
      ["ftp://127.0.0.1:4010", /http\(s\)/],
      ["file:///tmp/x", /http\(s\)/],
      ["http://user:pass@127.0.0.1:4010", /credentials/],
      ["http://127.0.0.1:4010/v1", /origin only/],
      ["http://127.0.0.1:4010/?x=1", /origin only/],
      ["http://127.0.0.1:4010/#frag", /origin only/],
    ];
    for (const [raw, why] of cases) {
      const decision = razorpayApiBaseOverride({ ...TEST_KEY, RAZORPAY_API_BASE_URL: raw });
      expect(decision.use, raw).toBe("razorpay");
      expect(decision.ignored, raw).toMatch(why);
    }
  });
});

describe("isLoopbackHost", () => {
  it("knows loopback from look-alikes", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("127.255.0.9")).toBe(true);
    expect(isLoopbackHost("LOCALHOST")).toBe(true);
    expect(isLoopbackHost("[::1]")).toBe(true);
    expect(isLoopbackHost("127.0.0.1.nip.io")).toBe(false);
    expect(isLoopbackHost("128.0.0.1")).toBe(false);
    expect(isLoopbackHost("")).toBe(false);
  });
});

describe("every server-side Razorpay client", () => {
  // The override only works if nothing builds its own client: a route that
  // called `new Razorpay(...)` directly would reach the real gateway from the
  // quality gate, and the egress guard would turn the whole runner red for a
  // reason that reads as a network fault rather than a missed factory.
  it("is built by createRazorpayClient", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    function walk(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return walk(path);
        return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path] : [];
      });
    }
    const offenders = walk("src").filter(
      (file) => file !== join("src", "lib", "razorpayClient.ts") && /new\s+Razorpay\s*\(/.test(readFileSync(file, "utf8"))
    );
    expect(offenders).toEqual([]);
  });
});
