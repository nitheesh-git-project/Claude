import { describe, expect, it } from "vitest";
import {
  buildChartGeometry,
  chartSummaryText,
  describeDelta,
  formatMeasureValue,
  formatReading,
  labelAnchor,
  labelIndices,
  labelPlacement,
  niceTicks,
  riskLineNearData,
  sparklinePath,
  unitSuffix,
} from "@/lib/progressChart";

describe("niceTicks", () => {
  it("covers the range on round steps", () => {
    const t = niceTicks(0, 10);
    expect(t.ticks[0]).toBeLessThanOrEqual(0);
    expect(t.ticks[t.ticks.length - 1]).toBeGreaterThanOrEqual(10);
    expect(t.ticks).toEqual([0, 2.5, 5, 7.5, 10]);
  });
  it("uses whole steps for an 85-122 degree range", () => {
    const t = niceTicks(80, 130);
    expect(t.min).toBeLessThanOrEqual(80);
    expect(t.max).toBeGreaterThanOrEqual(130);
    expect(t.ticks.every((v) => Number.isInteger(v))).toBe(true);
  });
  it("widens a zero-width range rather than dividing by zero", () => {
    const t = niceTicks(5, 5);
    expect(t.ticks.length).toBeGreaterThanOrEqual(2);
    expect(t.min).toBeLessThan(5);
    expect(t.max).toBeGreaterThan(5);
  });
  it("accepts reversed and non-finite input", () => {
    expect(niceTicks(10, 0).ticks).toEqual(niceTicks(0, 10).ticks);
    expect(niceTicks(Number.NaN, Number.NaN).ticks.length).toBeGreaterThanOrEqual(2);
  });
  it("keeps decimal steps free of floating-point noise", () => {
    const t = niceTicks(0.3, 1.2);
    expect(t.ticks.every((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6)).toBe(true);
  });
  it("handles negative ranges", () => {
    const t = niceTicks(-12, 30);
    expect(t.min).toBeLessThanOrEqual(-12);
    expect(t.ticks).toContain(0);
  });
});

describe("buildChartGeometry", () => {
  it("returns nothing to draw for no values", () => {
    const g = buildChartGeometry({ values: [], better: "higher" });
    expect(g.points).toEqual([]);
    expect(g.linePath).toBe("");
    expect(g.areaPath).toBe("");
  });

  it("puts a single dot in the middle, with no line or area", () => {
    const g = buildChartGeometry({ values: [7], better: "lower" });
    expect(g.points).toHaveLength(1);
    expect(g.points[0].x).toBeCloseTo((g.plot.left + g.plot.right) / 2, 1);
    expect(g.areaPath).toBe("");
    expect(g.yMax).toBeGreaterThan(g.yMin);
  });

  it("gives a flat series a real scale and a level line", () => {
    const g = buildChartGeometry({ values: [4, 4, 4], better: "lower" });
    expect(g.yMax).toBeGreaterThan(g.yMin);
    const ys = new Set(g.points.map((p) => p.y));
    expect(ys.size).toBe(1);
    expect(g.points[0].y).toBeGreaterThan(g.plot.top);
    expect(g.points[0].y).toBeLessThan(g.plot.bottom);
  });

  it("spaces dots evenly from the left to the right edge of the plot", () => {
    const g = buildChartGeometry({ values: [1, 2, 3, 4, 5], better: "higher" });
    expect(g.points[0].x).toBe(g.plot.left);
    expect(g.points[4].x).toBe(g.plot.right);
    const gaps = g.points.slice(1).map((p, i) => p.x - g.points[i].x);
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 1);
  });

  it("draws a higher value higher on the screen (smaller y)", () => {
    const g = buildChartGeometry({ values: [32, 58], better: "higher" });
    expect(g.points[1].y).toBeLessThan(g.points[0].y);
  });

  it("keeps every dot and the goal inside the plot", () => {
    const g = buildChartGeometry({ values: [85, 95, 122], better: "higher", goal: 135 });
    for (const p of g.points) {
      expect(p.y).toBeGreaterThanOrEqual(g.plot.top);
      expect(p.y).toBeLessThanOrEqual(g.plot.bottom);
    }
    expect(g.goal!.y).toBeGreaterThanOrEqual(g.plot.top);
    expect(g.yMax).toBeGreaterThanOrEqual(135);
  });

  it("paints the goal band above the goal when higher is better", () => {
    const g = buildChartGeometry({ values: [32, 58], better: "higher", goal: 70 });
    expect(g.goal!.band!.side).toBe("above");
    expect(g.goal!.band!.y).toBe(g.plot.top);
    expect(g.goal!.band!.height).toBeCloseTo(g.goal!.y - g.plot.top, 1);
  });

  it("paints the goal band below the goal when lower is better", () => {
    const g = buildChartGeometry({ values: [7, 3], better: "lower", goal: 2 });
    expect(g.goal!.band!.side).toBe("below");
    expect(g.goal!.band!.y).toBe(g.goal!.y);
    expect(g.goal!.band!.y + g.goal!.band!.height).toBeCloseTo(g.plot.bottom, 1);
  });

  it("gives a goal line and no band for a measure with no direction", () => {
    const g = buildChartGeometry({ values: [3, 4], better: "hold", goal: 2 });
    expect(g.goal).not.toBeNull();
    expect(g.goal!.band).toBeNull();
    const toward = buildChartGeometry({ values: [3, 4], better: "toward_normal", goal: 2 });
    expect(toward.goal!.band).toBeNull();
  });

  it("has no goal when none is set", () => {
    expect(buildChartGeometry({ values: [1, 2], better: "higher" }).goal).toBeNull();
    expect(buildChartGeometry({ values: [1, 2], better: "higher", goal: Number.NaN }).goal).toBeNull();
  });

  it("includes a risk line near the data in the scale", () => {
    const g = buildChartGeometry({ values: [14, 13, 11], better: "lower", risk: { value: 12, label: "12 s" } });
    expect(g.risk!.y).not.toBeNull();
    expect(g.risk!.offscreen).toBeNull();
    expect(g.risk!.y!).toBeGreaterThanOrEqual(g.plot.top);
  });

  it("reports a risk line far from the data as off the chart rather than squashing the data", () => {
    const g = buildChartGeometry({ values: [3, 2.5], better: "lower", risk: { value: 120, label: "far" } });
    expect(g.risk!.y).toBeNull();
    expect(g.risk!.offscreen).toBe("above");
    const below = buildChartGeometry({ values: [100, 105], better: "higher", risk: { value: 1, label: "far" } });
    expect(below.risk!.offscreen).toBe("below");
  });

  it("clamps the scale to the measure's own range", () => {
    const g = buildChartGeometry({ values: [3, 1], better: "lower", goal: 0, bounds: { min: 0, max: 10 } });
    expect(g.yMin).toBeGreaterThanOrEqual(0);
    expect(g.yMax).toBeLessThanOrEqual(10);
    for (const t of g.ticks) {
      expect(t.value).toBeGreaterThanOrEqual(0);
      expect(t.value).toBeLessThanOrEqual(10);
    }
  });

  it("copes with a flat series sitting on a bound", () => {
    const g = buildChartGeometry({ values: [0, 0], better: "lower", bounds: { min: 0, max: 10 } });
    expect(g.yMax).toBeGreaterThan(g.yMin);
    for (const p of g.points) expect(Number.isFinite(p.y)).toBe(true);
  });

  it("never produces NaN coordinates", () => {
    const g = buildChartGeometry({ values: [Number.NaN, 5, 6], better: "higher" });
    expect(g.points).toHaveLength(2);
    expect(g.linePath).not.toMatch(/NaN/);
  });

  it("closes the area down to the baseline", () => {
    const g = buildChartGeometry({ values: [1, 2, 3], better: "higher" });
    expect(g.areaPath.endsWith("Z")).toBe(true);
    expect(g.areaPath).toContain(` ${g.plot.bottom} `);
  });
});

describe("riskLineNearData", () => {
  it("is near when inside or close to the data", () => {
    expect(riskLineNearData(12, 8, 10)).toBe(true);
    expect(riskLineNearData(9, 8, 10)).toBe(true);
  });
  it("is not near when far outside it", () => {
    expect(riskLineNearData(120, 2, 3)).toBe(false);
  });
});

describe("labels", () => {
  it("labels the first and last dot and no more than the maximum", () => {
    expect(labelIndices(1, 4)).toEqual([0]);
    expect(labelIndices(2, 4)).toEqual([0, 1]);
    expect(labelIndices(6, 3)).toEqual([0, 3, 5]);
    const many = labelIndices(20, 4);
    expect(many.length).toBeLessThanOrEqual(4);
    expect(many[0]).toBe(0);
    expect(many[many.length - 1]).toBe(19);
    expect(many).toEqual([...many].sort((a, b) => a - b));
  });
  it("returns nothing for no dots", () => {
    expect(labelIndices(0, 4)).toEqual([]);
  });
  it("anchors the ends inwards", () => {
    expect(labelAnchor(0, 5)).toBe("start");
    expect(labelAnchor(4, 5)).toBe("end");
    expect(labelAnchor(2, 5)).toBe("middle");
    expect(labelAnchor(0, 1)).toBe("middle");
  });
});

describe("formatting", () => {
  it("drops trailing zeros", () => {
    expect(formatMeasureValue(3.5, 2)).toBe("3.5");
    expect(formatMeasureValue(122, 1)).toBe("122");
    expect(formatMeasureValue(0.8, 2)).toBe("0.8");
    expect(formatMeasureValue(Number.NaN, 1)).toBe("-");
  });
  it("attaches or drops the unit as it reads", () => {
    expect(unitSuffix("degrees")).toBe("°");
    expect(unitSuffix("%")).toBe("%");
    expect(unitSuffix("0-80")).toBe("");
    expect(unitSuffix("stage 0-4")).toBe("");
    expect(unitSuffix("seconds")).toBe(" seconds");
    expect(formatReading(122, 0, "degrees")).toBe("122°");
    expect(formatReading(58, 0, "0-80")).toBe("58");
    expect(formatReading(0.85, 2, "m/s")).toBe("0.85 m/s");
  });
});

describe("describeDelta", () => {
  it("is neutral when the change is inside the measurement error", () => {
    const d = describeDelta({ first: 10, now: 10.4, decimals: 1, unit: "seconds", change: "no_change" });
    expect(d!.tone).toBe("neutral");
    expect(d!.text).toMatch(/within the usual error/);
  });
  it("is good for a real move the right way and bad for the wrong way", () => {
    expect(describeDelta({ first: 85, now: 122, decimals: 0, unit: "degrees", change: "better" })).toMatchObject({
      text: "Up 37°",
      tone: "good",
    });
    expect(describeDelta({ first: 7, now: 3, decimals: 0, unit: "0-10", change: "better" })).toMatchObject({
      text: "Down 4",
      tone: "good",
    });
    expect(describeDelta({ first: 7, now: 9, decimals: 0, unit: "0-10", change: "worse" })!.tone).toBe("bad");
  });
  it("does not call a move with no direction good or bad", () => {
    expect(describeDelta({ first: 1, now: 3, decimals: 0, unit: "stage", change: "changed" })!.tone).toBe("neutral");
  });
  it("says no change when the numbers are equal and gives null when it cannot judge", () => {
    expect(describeDelta({ first: 5, now: 5, decimals: 0, unit: "", change: "no_change" })!.text).toBe("No change");
    expect(describeDelta({ first: 5, now: 6, decimals: 0, unit: "", change: null })).toBeNull();
  });
});

describe("sparklinePath", () => {
  it("is null for fewer than two values", () => {
    expect(sparklinePath([])).toBeNull();
    expect(sparklinePath([3])).toBeNull();
  });
  it("is level when flat and keeps higher values higher", () => {
    expect(sparklinePath([4, 4, 4])).toBe("M 0 14 L 50 14 L 100 14");
    const up = sparklinePath([1, 5])!;
    const [, , y0, , , y1] = up.split(" ");
    expect(Number(y1)).toBeLessThan(Number(y0));
  });
});

describe("chartSummaryText", () => {
  it("describes first, last and goal", () => {
    const text = chartSummaryText({
      label: "Knee bend",
      unit: "degrees",
      decimals: 0,
      points: [
        { value: 85, dateLabel: "3 Aug" },
        { value: 122, dateLabel: "12 Oct" },
      ],
      goal: 135,
      better: "higher",
    });
    expect(text).toBe("Knee bend: 85° on 3 Aug, 122° on 12 Oct, over 2 reviews. Goal 135° or higher.");
  });
  it("says so for one review and for none", () => {
    expect(
      chartSummaryText({ label: "Pain", unit: "0-10", decimals: 0, points: [{ value: 7, dateLabel: "3 Aug" }], better: "lower" })
    ).toContain("only review");
    expect(chartSummaryText({ label: "Pain", unit: "0-10", decimals: 0, points: [], better: "lower" })).toContain("nothing recorded");
  });
});

describe("labelPlacement", () => {
  it("writes the value below a falling line's dot and above a rising one", () => {
    // y grows downwards: previous point higher on screen (smaller y) = falling value.
    const pts = [{ y: 10 }, { y: 40 }, { y: 20 }];
    expect(labelPlacement(pts, 0)).toBe("above");
    expect(labelPlacement(pts, 1)).toBe("below");
    expect(labelPlacement(pts, 2)).toBe("above");
  });
});
