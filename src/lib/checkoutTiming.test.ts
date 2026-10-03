import { describe, expect, it } from "vitest";
import {
  buildCheckoutTimingReport,
  MAX_CHECKOUT_TIMING_MS,
  percentileMs,
  startCheckoutTimer,
  type CheckoutTimingReport,
} from "./checkoutTiming";

describe("buildCheckoutTimingReport", () => {
  it("splits the total into stages measured from the previous mark", () => {
    const r = buildCheckoutTimingReport({
      flow: "online",
      newAccount: true,
      outcome: "opened",
      startedAt: 1000,
      endedAt: 2600,
      marks: [
        { stage: "signup", at: 1300 },
        { stage: "create", at: 2000 },
        { stage: "order", at: 2550 },
      ],
    });
    expect(r).toEqual({
      flow: "online",
      newAccount: true,
      outcome: "opened",
      totalMs: 1600,
      stagesMs: { signup: 300, create: 700, order: 550 },
    });
  });

  it("drops a mark that runs backwards or past the end", () => {
    const r = buildCheckoutTimingReport({
      flow: "online",
      newAccount: false,
      outcome: "opened",
      startedAt: 0,
      endedAt: 100,
      marks: [
        { stage: "create", at: 50 },
        { stage: "order", at: 40 },
      ],
    });
    expect(r?.stagesMs).toEqual({ create: 50 });
  });

  it("refuses a reading that cannot be a real tap", () => {
    const base = { flow: "online" as const, newAccount: false, outcome: "opened" as const, marks: [] };
    expect(buildCheckoutTimingReport({ ...base, startedAt: 10, endedAt: 5 })).toBeNull();
    expect(
      buildCheckoutTimingReport({ ...base, startedAt: 0, endedAt: MAX_CHECKOUT_TIMING_MS + 1 })
    ).toBeNull();
  });
});

describe("percentileMs", () => {
  it("answers nearest-rank", () => {
    expect(percentileMs([500, 100, 300, 200, 400], 50)).toBe(300);
    expect(percentileMs([500, 100, 300, 200, 400], 90)).toBe(500);
  });
  it("is null with nothing to measure", () => {
    expect(percentileMs([], 75)).toBeNull();
  });
});

describe("startCheckoutTimer", () => {
  it("reports once, however many times it is finished", () => {
    let t = 0;
    const sent: CheckoutTimingReport[] = [];
    const timer = startCheckoutTimer(
      { flow: "home_visit", newAccount: false },
      { now: () => t, send: (r) => sent.push(r) }
    );
    t = 200;
    timer.mark("order");
    t = 250;
    timer.finish("opened");
    timer.finish("error");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ outcome: "opened", totalMs: 250, stagesMs: { order: 200 } });
  });
});
