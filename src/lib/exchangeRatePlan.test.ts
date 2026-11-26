import { describe, it, expect } from "vitest";
import { autoRefreshDue, planRateRefresh, rateMovePercent, ratesNeedingAttention } from "./exchangeRatePlan";

const usd = { code: "US", currency: "USD", rate: 0.0118 };

describe("planRateRefresh", () => {
  it("uses a small move straight away", () => {
    const plan = planRateRefresh([{ code: "US", enabled: true, unitsPerInr: 0.012 }], [usd]);
    expect(plan.apply).toEqual([usd]);
    expect(plan.hold).toEqual([]);
  });

  it("holds a switched-on country's move above 10%, either way", () => {
    const up = planRateRefresh([{ code: "US", enabled: true, unitsPerInr: 0.01 }], [usd]);
    expect(up.apply).toEqual([]);
    expect(up.hold[0]).toMatchObject({ code: "US", current: 0.01, rate: 0.0118, movePercent: 18 });
    const down = planRateRefresh([{ code: "US", enabled: true, unitsPerInr: 0.0135 }], [usd]);
    expect(down.hold[0].movePercent).toBeCloseTo(-12.6, 1);
  });

  it("updates a switched-off country however far it moved, and a country with no rate yet", () => {
    expect(planRateRefresh([{ code: "US", enabled: false, unitsPerInr: 0.005 }], [usd]).apply).toEqual([usd]);
    expect(planRateRefresh([], [usd]).apply).toEqual([usd]);
  });

  it("treats exactly 10% as small", () => {
    expect(rateMovePercent(0.01, 0.011)).toBe(10);
    expect(planRateRefresh([{ code: "US", enabled: true, unitsPerInr: 0.01 }], [{ ...usd, rate: 0.011 }]).hold).toEqual([]);
  });
});

describe("autoRefreshDue", () => {
  const now = Date.parse("2026-11-26T12:00:00Z");
  it("refreshes once a day, and never for rates nobody has set up", () => {
    expect(autoRefreshDue("2026-11-25T15:00:00Z", now)).toBe(true);
    expect(autoRefreshDue("2026-11-26T02:00:00Z", now)).toBe(false);
    expect(autoRefreshDue(null, now)).toBe(false);
    expect(autoRefreshDue("not a date", now)).toBe(false);
  });
});

describe("ratesNeedingAttention", () => {
  const rows = [
    { code: "US", enabled: true, pendingUnitsPerInr: 0.0118 },
    { code: "GB", enabled: true, pendingUnitsPerInr: null },
    { code: "OM", enabled: false, pendingUnitsPerInr: 0.005 },
  ];
  it("counts switched-on countries with a rate waiting", () => {
    expect(ratesNeedingAttention({ internationalEnabled: true, rows, stale: false })).toEqual({ count: 1, pending: 1, stale: false });
  });
  it("counts every switched-on country when the rates are stale", () => {
    expect(ratesNeedingAttention({ internationalEnabled: true, rows, stale: true })).toEqual({ count: 2, pending: 1, stale: true });
  });
  it("asks for nothing while local prices are off", () => {
    expect(ratesNeedingAttention({ internationalEnabled: false, rows, stale: true }).count).toBe(0);
  });
});
