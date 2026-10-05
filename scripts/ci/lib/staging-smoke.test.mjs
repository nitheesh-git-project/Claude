import { describe, expect, it } from "vitest";
import { judge, validateTarget } from "../staging-smoke.mjs";

describe("staging smoke target", () => {
  it("refuses to run with no target", () => {
    expect(validateTarget({}).ok).toBe(false);
  });
  it("refuses plain http and garbage", () => {
    expect(validateTarget({ STAGING_URL: "http://staging.example.com" }).ok).toBe(false);
    expect(validateTarget({ STAGING_URL: "not a url" }).ok).toBe(false);
  });
  it("refuses the production origin", () => {
    const r = validateTarget({ STAGING_URL: "https://site.example.com/x", PRODUCTION_URL: "https://site.example.com" });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/production/);
  });
  it("accepts a distinct https staging origin", () => {
    expect(validateTarget({ STAGING_URL: "https://staging.example.com", PRODUCTION_URL: "https://example.com" })).toEqual({
      ok: true,
      origin: "https://staging.example.com",
    });
  });
});

describe("judge", () => {
  it("wants a 200 for a public page and anything but a 200 page for a guarded one", () => {
    expect(judge("ok", 200)).toBe(true);
    expect(judge("ok", 307)).toBe(false);
    expect(judge("guarded", 307)).toBe(true);
    expect(judge("guarded", 401)).toBe(true);
    expect(judge("guarded", 200)).toBe(false);
    expect(judge("guarded", 0)).toBe(false);
    expect(judge("guarded", 502)).toBe(false);
  });
});
