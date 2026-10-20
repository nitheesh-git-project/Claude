import { describe, expect, it } from "vitest";
import { fractionOf, pointOnArc, rangeGaugeGeometry, symmetryBarGeometry } from "@/lib/rangeGauge";

describe("rangeGauge", () => {
  it("clamps and survives a broken scale", () => {
    expect(fractionOf(5, 0, 10)).toBe(0.5);
    expect(fractionOf(-4, 0, 10)).toBe(0);
    expect(fractionOf(40, 0, 10)).toBe(1);
    expect(fractionOf(3, 10, 10)).toBe(0);
    expect(fractionOf(Number.NaN, 0, 10)).toBe(0);
  });

  it("puts the arc ends and top where the dial draws them", () => {
    expect(pointOnArc(0)).toEqual({ x: 10, y: 62 });
    expect(pointOnArc(1)).toEqual({ x: 110, y: 62 });
    expect(pointOnArc(0.5)).toEqual({ x: 60, y: 12 });
  });

  it("draws a knee at 122 of a 135 goal on a 0-150 scale", () => {
    const g = rangeGaugeGeometry({ value: 122, max: 150, goal: 135, start: 85 });
    expect(g.fraction).toBeCloseTo(0.8133, 3);
    expect(g.dashArray).toBe("81.33 100");
    expect(g.goal!.fraction).toBeCloseTo(0.9, 3);
    expect(g.start!.fraction).toBeCloseTo(0.5667, 3);
  });

  it("keeps an out-of-scale reading on the dial and a missing goal off it", () => {
    const g = rangeGaugeGeometry({ value: 400, max: 150 });
    expect(g.fraction).toBe(1);
    expect(g.goal).toBeNull();
    expect(rangeGaugeGeometry({ value: -20, max: 150 }).dashArray).toBe("0 100");
  });

  it("draws leg strength against a 90% goal", () => {
    const g = symmetryBarGeometry({ percent: 78, goal: 90 });
    expect(g).toEqual({ fillPercent: 78, goalPercent: 90, scaleMax: 100, reachedGoal: false });
    expect(symmetryBarGeometry({ percent: 92, goal: 90 }).reachedGoal).toBe(true);
  });

  it("grows the scale for a leg stronger than its partner", () => {
    const g = symmetryBarGeometry({ percent: 112, goal: 90 });
    expect(g.scaleMax).toBe(120);
    expect(g.fillPercent).toBeCloseTo(93.3, 1);
    expect(symmetryBarGeometry({ percent: 50 }).goalPercent).toBeNull();
  });
});
