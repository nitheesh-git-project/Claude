import { describe, expect, it } from "vitest";
import { completionOpensAtMs } from "@/lib/sessionCompletion";

const SLOT = Date.parse("2026-10-01T12:30:00Z");

describe("completionOpensAtMs", () => {
  it("opens Done at the scheduled start, not at the join window", () => {
    expect(completionOpensAtMs(SLOT, "done", 15)).toBe(SLOT);
  });

  it("opens No-show only after the late-arrival grace", () => {
    expect(completionOpensAtMs(SLOT, "no_show", 15)).toBe(SLOT + 15 * 60_000);
  });

  it("never opens No-show before the start, whatever the setting says", () => {
    expect(completionOpensAtMs(SLOT, "no_show", -10)).toBe(SLOT);
  });
});
