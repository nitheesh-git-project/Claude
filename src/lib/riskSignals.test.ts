import { describe, it, expect } from "vitest";
import { ruleNumber, belowRate, countPhrase, RISK_RULE_KEYS } from "@/lib/riskSignals";

describe("ruleNumber", () => {
  it("reads a configured number", () => {
    expect(ruleNumber({ threshold: 12 }, "threshold", 3)).toBe(12);
    expect(ruleNumber({ threshold: 0 }, "threshold", 3)).toBe(0);
  });

  it("falls back rather than treating a missing key as zero", () => {
    // A detector that read a missing threshold as 0 would fire on the whole
    // clinic on its first run.
    expect(ruleNumber({}, "threshold", 3)).toBe(3);
    expect(ruleNumber({ threshold: "12" }, "threshold", 3)).toBe(3);
    expect(ruleNumber({ threshold: null }, "threshold", 3)).toBe(3);
    expect(ruleNumber({ threshold: NaN }, "threshold", 3)).toBe(3);
  });
});

describe("belowRate", () => {
  it("stays silent below the sample size", () => {
    // One purchase out of two is a 50% conversion rate and no story at all.
    expect(belowRate(1, 2, 5, 0.5)).toBe(false);
    expect(belowRate(0, 4, 5, 0.5)).toBe(false);
  });

  it("fires once there are enough observations", () => {
    expect(belowRate(1, 10, 5, 0.5)).toBe(true);
    expect(belowRate(0, 5, 5, 0.2)).toBe(true);
  });

  it("does not fire at or above the floor", () => {
    expect(belowRate(5, 10, 5, 0.5)).toBe(false);
    expect(belowRate(9, 10, 5, 0.5)).toBe(false);
  });
});

describe("countPhrase", () => {
  it("pluralises", () => {
    expect(countPhrase(1, "message")).toBe("1 message");
    expect(countPhrase(2, "message")).toBe("2 messages");
    expect(countPhrase(0, "message")).toBe("0 messages");
    expect(countPhrase(2, "entry", "entries")).toBe("2 entries");
  });
});

describe("rule keys", () => {
  it("are unique", () => {
    expect(new Set(RISK_RULE_KEYS).size).toBe(RISK_RULE_KEYS.length);
  });
});
