import { describe, expect, it } from "vitest";
import {
  COOKIE_POLICY_VERSION,
  CONSENT_REST_MS,
  autoOpensOn,
  consentFor,
  isCurrentConsent,
  marketingConsentEnabled,
  parseStoredConsent,
  percentOf,
  shouldAskForCookieConsent,
  summariseConsents,
  validateConsentRecord,
  type CookieConsent,
} from "./cookieConsent";

const now = Date.parse("2026-11-12T10:00:00Z");
const day = 24 * 60 * 60 * 1000;
const current: CookieConsent = { version: COOKIE_POLICY_VERSION, analytics: true, marketing: false, at: now };

describe("parseStoredConsent", () => {
  it("reads a stored choice", () => {
    expect(parseStoredConsent(JSON.stringify(current), null)).toEqual(current);
  });
  it("falls back to the earlier analytics-only answer", () => {
    expect(parseStoredConsent(null, "granted")).toMatchObject({ version: "legacy", analytics: true, marketing: false });
    expect(parseStoredConsent(null, "denied")).toMatchObject({ analytics: false });
  });
  it("treats junk as undecided", () => {
    expect(parseStoredConsent("{oops", null)).toBeNull();
    expect(parseStoredConsent(JSON.stringify({ analytics: "yes" }), null)).toBeNull();
    expect(parseStoredConsent(null, "maybe")).toBeNull();
  });
});

describe("shouldAskForCookieConsent", () => {
  const ask = (over: Partial<Parameters<typeof shouldAskForCookieConsent>[0]>) =>
    shouldAskForCookieConsent({ consent: null, askedAtMs: null, askedInThisTab: false, nowMs: now, ...over });

  it("asks someone never asked, never someone who answered this policy", () => {
    expect(ask({})).toBe(true);
    expect(ask({ consent: current, askedInThisTab: true })).toBe(false);
  });
  it("asks again when the policy version changed, or the answer predates it", () => {
    expect(ask({ consent: { ...current, version: "2020-01-01" } })).toBe(true);
    expect(ask({ consent: { ...current, version: "legacy" } })).toBe(true);
  });
  it("rests one day in other tabs after an ignored pop-up", () => {
    expect(CONSENT_REST_MS).toBe(day);
    expect(ask({ askedAtMs: now - 60_000 })).toBe(false);
    expect(ask({ askedAtMs: now - 23 * 60 * 60 * 1000 })).toBe(false);
    expect(ask({ askedAtMs: now - day })).toBe(true);
    // A clock set back reads as "just asked".
    expect(ask({ askedAtMs: now + day })).toBe(false);
  });
  it("keeps asking in the tab that is showing it", () => {
    expect(ask({ askedAtMs: now - 1000, askedInThisTab: true })).toBe(true);
  });
});

describe("consentFor", () => {
  const chosen = { analytics: false, marketing: true };
  it("Accept all turns on everything that was asked", () => {
    expect(consentFor("accept_all", chosen, true, now)).toMatchObject({ analytics: true, marketing: true });
    expect(consentFor("accept_all", chosen, false, now)).toMatchObject({ analytics: true, marketing: false });
  });
  it("Reject all and closing allow nothing optional", () => {
    expect(consentFor("reject_all", { analytics: true, marketing: true }, true, now)).toMatchObject({ analytics: false, marketing: false });
    expect(consentFor("dismiss", { analytics: true, marketing: true }, true, now)).toMatchObject({ analytics: false, marketing: false });
  });
  it("Save keeps the switches, and never grants a category that was not shown", () => {
    expect(consentFor("save", chosen, true, now)).toMatchObject({ analytics: false, marketing: true });
    expect(consentFor("save", chosen, false, now)).toMatchObject({ marketing: false });
  });
  it("stamps the current policy", () => {
    expect(isCurrentConsent(consentFor("save", chosen, true, now))).toBe(true);
  });
});

describe("autoOpensOn", () => {
  it("opens on public pages but not inside a booking", () => {
    expect(autoOpensOn("/")).toBe(true);
    expect(autoOpensOn("/faq")).toBe(true);
    expect(autoOpensOn("/book")).toBe(false);
    expect(autoOpensOn("/book-home-visit")).toBe(false);
    expect(autoOpensOn("/book/step")).toBe(false);
    expect(autoOpensOn(null)).toBe(false);
  });
});

describe("marketingConsentEnabled", () => {
  it("is on only for an explicit true", () => {
    expect(marketingConsentEnabled("true")).toBe(true);
    expect(marketingConsentEnabled(" TRUE ")).toBe(true);
    expect(marketingConsentEnabled("")).toBe(false);
    expect(marketingConsentEnabled("1")).toBe(false);
    expect(marketingConsentEnabled(undefined)).toBe(false);
  });
});

describe("validateConsentRecord", () => {
  const base = {
    visitorId: "3b241101-e2bb-4255-8caf-4136c566a962",
    analytics: true,
    marketing: false,
    action: "accept_all",
    policyVersion: COOKIE_POLICY_VERSION,
    pagePath: "/faq?invite=SECRET#x",
  };
  it("accepts a well-formed choice and strips the query string", () => {
    const r = validateConsentRecord(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.pagePath).toBe("/faq");
  });
  it("refuses a bad visitor id, action or version", () => {
    expect(validateConsentRecord({ ...base, visitorId: "x" }).ok).toBe(false);
    expect(validateConsentRecord({ ...base, action: "maybe" }).ok).toBe(false);
    expect(validateConsentRecord({ ...base, policyVersion: "<script>" }).ok).toBe(false);
    expect(validateConsentRecord(null).ok).toBe(false);
  });
  it("refuses a body that disagrees with its own button", () => {
    expect(validateConsentRecord({ ...base, analytics: false }).ok).toBe(false);
    expect(validateConsentRecord({ ...base, action: "reject_all", analytics: true }).ok).toBe(false);
    expect(validateConsentRecord({ ...base, action: "dismiss", analytics: false, marketing: true }).ok).toBe(false);
  });
  it("drops a path that is not a path", () => {
    const r = validateConsentRecord({ ...base, pagePath: "https://evil.example" });
    expect(r.ok && r.value.pagePath).toBeNull();
  });
});

describe("summariseConsents", () => {
  it("counts each button and each category", () => {
    const s = summariseConsents([
      { action: "accept_all", analytics: true, marketing: true },
      { action: "accept_all", analytics: true, marketing: false },
      { action: "reject_all", analytics: false, marketing: false },
      { action: "save", analytics: true, marketing: false },
      { action: "dismiss", analytics: false, marketing: false },
    ]);
    expect(s).toEqual({ total: 5, acceptAll: 2, rejectAll: 1, custom: 1, dismissed: 1, analyticsOn: 3, marketingOn: 1 });
    expect(percentOf(s.acceptAll, s.total)).toBe(40);
    expect(percentOf(1, 0)).toBe(0);
  });
});
