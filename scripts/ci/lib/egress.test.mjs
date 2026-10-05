import { describe, expect, it } from "vitest";
import { evaluateDestination, hostFromRequestArgs, isLoopbackAddress } from "./egress.mjs";

const TEST_ENV = { NEXT_PUBLIC_RAZORPAY_KEY_ID: "rzp_test_Ab12Cd34Ef56Gh" };

describe("evaluateDestination", () => {
  it("allows loopback in every spelling", () => {
    for (const host of ["127.0.0.1", "localhost", "LOCALHOST", "::1", "[::1]", "127.0.0.53", "0.0.0.0"]) {
      expect(evaluateDestination(host, {}).allowed, host).toBe(true);
    }
  });

  it("allows a request with no host (a unix socket)", () => {
    expect(evaluateDestination(null, {}).allowed).toBe(true);
  });

  it("allows the font hosts", () => {
    expect(evaluateDestination("fonts.googleapis.com", {}).allowed).toBe(true);
    expect(evaluateDestination("fonts.gstatic.com", {}).allowed).toBe(true);
  });

  it("allows the Razorpay API only with a real test key", () => {
    expect(evaluateDestination("api.razorpay.com", TEST_ENV).allowed).toBe(true);
    expect(evaluateDestination("api.razorpay.com", {}).allowed).toBe(false);
    expect(evaluateDestination("api.razorpay.com", { NEXT_PUBLIC_RAZORPAY_KEY_ID: "rzp_test_placeholder" }).allowed).toBe(false);
    expect(evaluateDestination("api.razorpay.com", { NEXT_PUBLIC_RAZORPAY_KEY_ID: "rzp_live_Ab12Cd34Ef56Gh" }).allowed).toBe(false);
  });

  it("refuses everything else, including hosted Supabase, Google and mail providers", () => {
    for (const host of [
      "abcdefgh.supabase.co",
      "api.supabase.com",
      "oauth2.googleapis.com",
      "www.googleapis.com",
      "calendar.google.com",
      "smtp.sendgrid.net",
      "example.com",
      "api.razorpay.com.evil.test",
      "localhost.evil.test",
    ]) {
      expect(evaluateDestination(host, TEST_ENV).allowed, host).toBe(false);
    }
  });

  it("does not treat a lookalike as loopback", () => {
    expect(isLoopbackAddress("127.0.0.1.evil.test")).toBe(false);
    expect(isLoopbackAddress("1270.0.0.1")).toBe(false);
  });
});

describe("hostFromRequestArgs", () => {
  it("reads strings, URLs, Requests and option bags", () => {
    expect(hostFromRequestArgs(["https://api.razorpay.com/v1/orders"])).toBe("api.razorpay.com");
    expect(hostFromRequestArgs([new URL("http://127.0.0.1:54321/rest/v1/")])).toBe("127.0.0.1");
    expect(hostFromRequestArgs([{ url: "https://oauth2.googleapis.com/token" }])).toBe("oauth2.googleapis.com");
    expect(hostFromRequestArgs([{ hostname: "api.razorpay.com", path: "/v1" }])).toBe("api.razorpay.com");
    expect(hostFromRequestArgs([{ host: "example.com:443" }])).toBe("example.com");
    expect(hostFromRequestArgs([{ path: "/x" }])).toBe("localhost");
    expect(hostFromRequestArgs([{ socketPath: "/tmp/s" }])).toBeNull();
    expect(hostFromRequestArgs(["not a url"])).toBeNull();
  });

  it("reads the options bag when the first argument is a URL path and the second the options", () => {
    expect(hostFromRequestArgs([undefined, { hostname: "abc.supabase.co" }])).toBe("abc.supabase.co");
  });
});

describe("stubFor", () => {
  it("answers next dev's version check locally and nothing else", async () => {
    const { stubFor } = await import("./egress.mjs");
    expect(stubFor("https://registry.npmjs.org/-/package/next/dist-tags")?.status).toBe(404);
    expect(stubFor("https://registry.npmjs.org/-/package/next/dist-tags?x=1")).toBeNull();
    expect(stubFor("https://registry.npmjs.org/next")).toBeNull();
    expect(stubFor("https://api.razorpay.com/v1/orders")).toBeNull();
    expect(stubFor(undefined)).toBeNull();
  });
});
