import { describe, expect, it } from "vitest";
import { summariseRiskSweep } from "./riskSweepSummary";

const label = (k: string) => ({ cash_variance: "Cash variance", pay_later_aged: "Aged balances" })[k] ?? k;
const base = {
  finishedAt: "2026-10-02T10:00:00Z",
  complete: true,
  failedRules: [],
  unreachedRules: [],
  truncatedRules: [],
  unrecordedCount: 0,
};

describe("summariseRiskSweep", () => {
  it("is an all-clear only for a complete sweep", () => {
    expect(summariseRiskSweep({ report: base, readFailed: false }, label)).toEqual({ trustworthy: true, problems: [] });
  });

  it("never reads a missing or unreadable report as all clear", () => {
    expect(summariseRiskSweep({ report: null, readFailed: false }, label).trustworthy).toBe(false);
    expect(summariseRiskSweep({ report: base, readFailed: true }, label).trustworthy).toBe(false);
  });

  it("names every rule that failed, was not reached or was capped", () => {
    const s = summariseRiskSweep(
      {
        report: {
          ...base,
          complete: false,
          failedRules: ["cash_variance"],
          unreachedRules: ["pay_later_aged"],
          truncatedRules: ["contact_leak"],
          unrecordedCount: 2,
        },
        readFailed: false,
      },
      label
    );
    expect(s.trustworthy).toBe(false);
    expect(s.problems.join(" ")).toContain("Cash variance");
    expect(s.problems.join(" ")).toContain("Aged balances");
    expect(s.problems.join(" ")).toContain("contact_leak");
    expect(s.problems.join(" ")).toContain("2 findings");
  });

  it("joins several names in a sentence", () => {
    const s = summariseRiskSweep(
      { report: { ...base, complete: false, failedRules: ["a", "b", "c"] }, readFailed: false },
      (k) => k.toUpperCase()
    );
    expect(s.problems[0]).toContain("A, B and C");
  });

  it("still refuses an all-clear when incomplete with nothing named", () => {
    const s = summariseRiskSweep({ report: { ...base, complete: false }, readFailed: false }, label);
    expect(s.trustworthy).toBe(false);
    expect(s.problems).toHaveLength(1);
  });
});
