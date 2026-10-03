import { afterEach, describe, expect, it } from "vitest";
import { DEBUG_NOW_OFFSET_HEADER, resolveServerNowMs, serverNowMs } from "./debugClock";

const REAL = Date.UTC(2026, 9, 2, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

describe("resolveServerNowMs", () => {
  it("applies the offset when the debug clock is switched on", () => {
    expect(resolveServerNowMs({ realNowMs: REAL, headerValue: String(HOUR), enabled: true })).toBe(REAL + HOUR);
    expect(resolveServerNowMs({ realNowMs: REAL, headerValue: String(-HOUR), enabled: true })).toBe(REAL - HOUR);
  });

  it("ignores the header entirely when switched off", () => {
    expect(resolveServerNowMs({ realNowMs: REAL, headerValue: String(HOUR), enabled: false })).toBe(REAL);
  });

  it("falls back to the real clock on a missing, malformed or absurd header", () => {
    for (const headerValue of [null, undefined, "", "abc", "NaN", "Infinity", String(400 * 24 * HOUR)]) {
      expect(resolveServerNowMs({ realNowMs: REAL, headerValue, enabled: true })).toBe(REAL);
    }
  });
});

describe("serverNowMs", () => {
  const original = process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV;
    else process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV = original;
  });
  const request = (offset: number) => ({
    headers: { get: (name: string) => (name === DEBUG_NOW_OFFSET_HEADER ? String(offset) : null) },
  });
  const offset = 30 * 24 * HOUR;

  it("honours the header whenever the debug bar is on, with no other setting", () => {
    // The bar's own default: unset means on everywhere while pre-launch.
    delete process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV;
    expect(serverNowMs(request(offset)) - Date.now()).toBeGreaterThan(offset - 5000);
    process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV = "true";
    expect(serverNowMs(request(offset)) - Date.now()).toBeGreaterThan(offset - 5000);
  });

  it("ignores the header once the bar is switched off", () => {
    process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV = "false";
    expect(Math.abs(serverNowMs(request(offset)) - Date.now())).toBeLessThan(5000);
  });
});
