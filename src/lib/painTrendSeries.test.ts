import { describe, expect, it } from "vitest";
import { painTrendSeries } from "./healthProfileSummary";

const row = (region: string, pain_percent: number, created_at: string, side = "na") => ({
  region,
  side,
  pain_percent,
  created_at,
});

describe("painTrendSeries", () => {
  it("keeps a second exam on the same day as its own point", () => {
    // The bug: both folded into one daily average and the 70 disappeared.
    const points = painTrendSeries([
      row("neck", 70, "2026-10-06T04:00:00Z"),
      row("neck", 40, "2026-10-06T09:00:00Z"),
    ]);
    expect(points.map((p) => p.percent)).toEqual([70, 40]);
  });

  it("treats a re-score of the same area as a new exam, however soon", () => {
    const points = painTrendSeries([
      row("neck", 60, "2026-10-06T04:00:00Z"),
      row("neck", 30, "2026-10-06T04:05:00Z"),
    ]);
    expect(points.map((p) => p.percent)).toEqual([60, 30]);
  });

  it("groups the areas of one exam into one point", () => {
    const points = painTrendSeries([
      row("neck", 60, "2026-10-01T04:00:00Z"),
      row("lower_back", 40, "2026-10-01T04:10:00Z"),
    ]);
    expect(points).toEqual([{ date: "2026-10-01T04:10:00Z", percent: 50, regions: 2 }]);
  });

  it("carries an area's last score into an exam that did not re-check it", () => {
    const points = painTrendSeries([
      row("neck", 80, "2026-10-01T04:00:00Z"),
      row("lower_back", 40, "2026-10-01T04:10:00Z"),
      // A week later only the neck is re-checked; the back keeps its 40.
      row("neck", 20, "2026-10-08T04:00:00Z"),
    ]);
    expect(points.map((p) => p.percent)).toEqual([60, 30]);
    expect(points[1].regions).toBe(1);
  });

  it("reads left and right as different areas", () => {
    const points = painTrendSeries([
      row("knee", 60, "2026-10-01T04:00:00Z", "left"),
      row("knee", 20, "2026-10-01T04:05:00Z", "right"),
    ]);
    expect(points).toHaveLength(1);
    expect(points[0].percent).toBe(40);
  });

  it("orders by time whatever order the rows arrive in", () => {
    const points = painTrendSeries([
      row("neck", 30, "2026-10-08T04:00:00Z"),
      row("neck", 70, "2026-10-01T04:00:00Z"),
    ]);
    expect(points.map((p) => p.percent)).toEqual([70, 30]);
  });

  it("is empty with no readings", () => {
    expect(painTrendSeries([])).toEqual([]);
  });
});
