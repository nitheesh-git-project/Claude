import { describe, expect, it } from "vitest";
import {
  RATE_LIMITS,
  clientIdentifier,
  rateLimitBucket,
  retryAfterSeconds,
} from "./rateLimit";

const headers = (map: Record<string, string>) => ({
  get: (name: string) => map[name.toLowerCase()] ?? null,
});

describe("clientIdentifier", () => {
  it("prefers x-real-ip, which is single-valued and cannot be padded", () => {
    expect(
      clientIdentifier(headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1" }))
    ).toBe("203.0.113.7");
  });

  it("falls back to the first x-forwarded-for entry", () => {
    expect(clientIdentifier(headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" }))).toBe(
      "203.0.113.7"
    );
  });

  it("trims, because the forwarded list is comma-space separated", () => {
    expect(clientIdentifier(headers({ "x-forwarded-for": "  203.0.113.7 , 70.41.3.18" }))).toBe(
      "203.0.113.7"
    );
  });

  // The caller allows the request when this is null. Returning a constant
  // instead would put every visitor in one bucket.
  it("is null when neither header is set, rather than inventing a key", () => {
    expect(clientIdentifier(headers({}))).toBeNull();
  });

  it("is null for a present but empty header", () => {
    expect(clientIdentifier(headers({ "x-real-ip": "   ", "x-forwarded-for": "" }))).toBeNull();
  });

  it("ignores a forwarded list that is nothing but separators", () => {
    expect(clientIdentifier(headers({ "x-forwarded-for": " , " }))).toBeNull();
  });
});

describe("rateLimitBucket", () => {
  // Without the scope, re-quoting a price would spend the allowance that
  // protects the referral lookup.
  it("keeps one caller's limits apart", () => {
    expect(rateLimitBucket("checkout", "1.2.3.4")).not.toBe(
      rateLimitBucket("referral-preview", "1.2.3.4")
    );
  });

  it("keeps two callers apart within one scope", () => {
    expect(rateLimitBucket("checkout", "1.2.3.4")).not.toBe(
      rateLimitBucket("checkout", "1.2.3.5")
    );
  });
});

describe("retryAfterSeconds", () => {
  it("passes a sane figure through", () => {
    expect(retryAfterSeconds(42, 600)).toBe(42);
  });

  // Retry-After: 0 invites an immediate retry that is certain to be refused.
  it("never returns zero or less", () => {
    expect(retryAfterSeconds(0, 600)).toBe(600);
    expect(retryAfterSeconds(-5, 600)).toBe(600);
  });

  it("rounds a fraction up rather than down", () => {
    expect(retryAfterSeconds(1.2, 600)).toBe(2);
  });

  it("falls back to the window for an unreadable answer", () => {
    expect(retryAfterSeconds(null, 300)).toBe(300);
    expect(retryAfterSeconds(undefined, 300)).toBe(300);
    expect(retryAfterSeconds("nonsense", 300)).toBe(300);
    expect(retryAfterSeconds(NaN, 300)).toBe(300);
  });
});

describe("RATE_LIMITS", () => {
  it("gives every limit a positive cap and window", () => {
    for (const [name, rule] of Object.entries(RATE_LIMITS)) {
      expect(rule.limit, name).toBeGreaterThan(0);
      expect(rule.windowSeconds, name).toBeGreaterThan(0);
    }
  });

  it("uses a distinct scope per limit, or two would share counters", () => {
    const scopes = Object.values(RATE_LIMITS).map((r) => r.scope);
    expect(new Set(scopes).size).toBe(scopes.length);
  });

  // The message reaches a patient mid-booking, so it must not read as a
  // fault in the app or quote a number that would change with the config.
  it("states a wait without naming the limit's own numbers", () => {
    for (const [name, rule] of Object.entries(RATE_LIMITS)) {
      expect(rule.message, name).not.toMatch(/\d/);
      expect(rule.message.length, name).toBeGreaterThan(20);
    }
  });
});
