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
  const original = process.env.ALLOW_DEBUG_CLOCK;
  afterEach(() => {
    if (original === undefined) delete process.env.ALLOW_DEBUG_CLOCK;
    else process.env.ALLOW_DEBUG_CLOCK = original;
  });
  const request = (offset: number) => ({
    headers: { get: (name: string) => (name === DEBUG_NOW_OFFSET_HEADER ? String(offset) : null) },
  });

  it("honours the header only when ALLOW_DEBUG_CLOCK is exactly \"true\"", () => {
    const offset = 30 * 24 * HOUR;
    process.env.ALLOW_DEBUG_CLOCK = "true";
    expect(serverNowMs(request(offset)) - Date.now()).toBeGreaterThan(offset - 5000);
    for (const value of ["1", "TRUE", "yes", ""]) {
      process.env.ALLOW_DEBUG_CLOCK = value;
      expect(Math.abs(serverNowMs(request(offset)) - Date.now())).toBeLessThan(5000);
    }
    delete process.env.ALLOW_DEBUG_CLOCK;
    expect(Math.abs(serverNowMs(request(offset)) - Date.now())).toBeLessThan(5000);
  });
});
