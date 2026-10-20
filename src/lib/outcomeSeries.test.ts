import { describe, expect, it } from "vitest";
import {
  buildMeasureSeries,
  goalForSeries,
  measureTableRows,
  parseMeasurementRow,
  parseMeasurementRows,
  reviewKeyFor,
  seriesKeyFor,
  toMeasurementReading,
  type MeasurementPoint,
  type MilestoneTarget,
} from "@/lib/outcomeSeries";

let seq = 0;
function row(over: Record<string, unknown>): Record<string, unknown> {
  seq += 1;
  return {
    id: `m${String(seq).padStart(3, "0")}`,
    patient_id: "p1",
    appointment_id: null,
    measure_key: "tug",
    variant: null,
    side: null,
    value: 14,
    items: null,
    conditions: { setting: "in_person" },
    recorded_by: "t1",
    recorded_by_role: "therapist",
    measured_at: "2026-09-01T05:00:00.000Z",
    schema_version: 1,
    created_at: "2026-09-01T05:01:00.000Z",
    ...over,
  };
}

function points(...rows: Record<string, unknown>[]): MeasurementPoint[] {
  return parseMeasurementRows(rows);
}

function milestone(over: Partial<MilestoneTarget>): MilestoneTarget {
  return {
    id: "ms1",
    linkedMeasureKey: "tug",
    linkedVariant: null,
    linkedSide: null,
    targetValue: 12,
    sortOrder: 1,
    status: "planned",
    reachedAt: null,
    ...over,
  };
}

describe("parseMeasurementRow", () => {
  it("reads a stored row into the app's shape", () => {
    const p = parseMeasurementRow(row({ value: "12.5", side: "left", items: [12, 13, "x"] }))!;
    expect(p.value).toBe(12.5);
    expect(p.side).toBe("left");
    expect(p.items).toEqual([12, 13, null]);
    expect(p.recordedByRole).toBe("therapist");
    expect(p.conditions.setting).toBe("in_person");
  });

  it("drops a row it cannot draw honestly, rather than plotting it at zero or 1970", () => {
    expect(parseMeasurementRow(row({ value: null }))).toBeNull();
    expect(parseMeasurementRow(row({ value: "abc" }))).toBeNull();
    expect(parseMeasurementRow(row({ measured_at: "not a date" }))).toBeNull();
    expect(parseMeasurementRow(null)).toBeNull();
    expect(parseMeasurementRows([row({}), row({ value: null })])).toHaveLength(1);
  });

  it("hands the milestone maths the fields it reads", () => {
    const p = parseMeasurementRow(row({ value: 11 }))!;
    expect(toMeasurementReading(p)).toEqual({
      id: p.id,
      measureKey: "tug",
      variant: null,
      side: null,
      value: 11,
      measuredAt: p.measuredAt,
    });
  });
});

describe("one line per measure, variant and side", () => {
  it("never lets two variants or two sides share a line", () => {
    const series = buildMeasureSeries(
      points(
        row({ measure_key: "joint_range", variant: "knee_flexion_active", side: "right", value: 100 }),
        row({ measure_key: "joint_range", variant: "knee_flexion_passive", side: "right", value: 110 }),
        row({ measure_key: "joint_range", variant: "knee_flexion_active", side: "left", value: 135 })
      ),
      { profileKind: "ortho" }
    );
    expect(series).toHaveLength(3);
    expect(new Set(series.map((s) => s.key)).size).toBe(3);
    // Variant order from the registry, then left before right.
    const active = series.filter((s) => s.variant === "knee_flexion_active");
    expect(active.map((s) => s.side)).toEqual(["left", "right"]);
    expect(series[0].variantLabel).toBeTruthy();
  });

  it("splits a Parkinson's line by ON and OFF, and only there", () => {
    const on = { setting: "in_person", medicationState: "on", lastDoseAt: "2026-09-01T03:00:00.000Z" };
    const off = { ...on, medicationState: "off" };
    const rows = [row({ conditions: on, value: 12 }), row({ conditions: off, value: 16, measured_at: "2026-09-02T05:00:00.000Z" })];
    const pd = buildMeasureSeries(points(...rows), { profileKind: "neuro_parkinsons" });
    expect(pd.map((s) => s.medicationState)).toEqual(["on", "off"]);
    const geri = buildMeasureSeries(points(...rows), { profileKind: "geriatric" });
    expect(geri).toHaveLength(1);
    expect(geri[0].medicationState).toBeNull();
    expect(seriesKeyFor({ measureKey: "tug", variant: null, side: null, medicationState: "on" })).toBe("tug|||on");
  });

  it("keeps the newest reading of a review, and says how many it stood for", () => {
    const series = buildMeasureSeries(
      points(
        row({ appointment_id: "a1", value: 15, measured_at: "2026-09-01T05:00:00.000Z" }),
        row({ appointment_id: "a1", value: 14, measured_at: "2026-09-01T05:10:00.000Z" }),
        row({ appointment_id: "a2", value: 13, measured_at: "2026-09-08T05:00:00.000Z" })
      ),
      { profileKind: "geriatric" }
    );
    expect(series[0].points.map((p) => p.value)).toEqual([14, 13]);
    expect(series[0].points[0].readingsInReview).toBe(2);
    expect(series[0].points[1].readingsInReview).toBe(1);
  });

  it("treats an unlinked reading's clinic day as its review", () => {
    // 23:00 IST and 00:30 IST the next day are two days, though both are
    // the same UTC day.
    const late = row({ measured_at: "2026-09-01T17:30:00.000Z", value: 15 });
    const early = row({ measured_at: "2026-09-01T19:00:00.000Z", value: 14 });
    expect(reviewKeyFor(parseMeasurementRow(late)!)).toBe("day:2026-09-01");
    expect(reviewKeyFor(parseMeasurementRow(early)!)).toBe("day:2026-09-02");
    expect(reviewKeyFor({ appointmentId: "a9", measuredAt: "2026-09-01T17:30:00.000Z" })).toBe("session:a9");
    const series = buildMeasureSeries(points(late, early), { profileKind: "geriatric" });
    expect(series[0].points).toHaveLength(2);
  });

  it("draws oldest first and orders lines by the registry", () => {
    const series = buildMeasureSeries(
      points(
        row({ measure_key: "chair_stand_30s", value: 9 }),
        row({ measure_key: "tug", value: 13, measured_at: "2026-09-09T05:00:00.000Z" }),
        row({ measure_key: "tug", value: 15, measured_at: "2026-09-02T05:00:00.000Z" })
      ),
      { profileKind: "geriatric" }
    );
    expect(series.map((s) => s.measureKey)).toEqual(["tug", "chair_stand_30s"]);
    expect(series[0].points.map((p) => p.value)).toEqual([15, 13]);
  });

  it("still draws a key the registry no longer holds, labelled by its key", () => {
    const [s] = buildMeasureSeries(points(row({ measure_key: "retired_test", value: 3 })), { profileKind: "ortho" });
    expect(s.known).toBe(false);
    expect(s.label).toBe("retired_test");
    expect(s.better).toBeNull();
  });
});

describe("the measures table", () => {
  const three = points(
    row({ value: 16, measured_at: "2026-08-01T05:00:00.000Z" }),
    row({ value: 14, measured_at: "2026-08-15T05:00:00.000Z" }),
    row({ value: 11, measured_at: "2026-09-01T05:00:00.000Z" })
  );

  it("gives first, now and the goal", () => {
    const series = buildMeasureSeries(three, { profileKind: "geriatric" });
    const [r] = measureTableRows(series, [milestone({ targetValue: 12 })], { profileKind: "geriatric" });
    expect(r.first.value).toBe(16);
    expect(r.now.value).toBe(11);
    expect(r.reviews).toBe(3);
    expect(r.goal).toEqual({ value: 12, milestoneId: "ms1", reached: false });
  });

  it("says no change below the MDC, and nothing at all with one reading", () => {
    const pd = { setting: "in_person", medicationState: "on", lastDoseAt: "2026-08-01T03:00:00.000Z" };
    // Parkinson's TUG: the smallest real change is 3.5 s.
    const small = points(
      row({ value: 14, conditions: pd, measured_at: "2026-08-01T05:00:00.000Z" }),
      row({ value: 12, conditions: pd, measured_at: "2026-09-01T05:00:00.000Z" })
    );
    const [r] = measureTableRows(buildMeasureSeries(small, { profileKind: "neuro_parkinsons" }), [], {
      profileKind: "neuro_parkinsons",
    });
    expect(r.change).toBe("no_change");
    const one = points(row({ value: 14 }));
    const [single] = measureTableRows(buildMeasureSeries(one, { profileKind: "geriatric" }), [], { profileKind: "geriatric" });
    expect(single.change).toBeNull();
    expect(single.meaningful).toBeNull();
    expect(single.first).toBe(single.now);
  });

  it("judges a joint range against its usual range", () => {
    const rom = points(
      row({ measure_key: "joint_range", variant: "knee_flexion_active", side: "right", value: 90, measured_at: "2026-08-01T05:00:00.000Z" }),
      row({ measure_key: "joint_range", variant: "knee_flexion_active", side: "right", value: 120, measured_at: "2026-09-01T05:00:00.000Z" })
    );
    const [r] = measureTableRows(buildMeasureSeries(rom, { profileKind: "ortho" }), [], { profileKind: "ortho" });
    expect(r.change).toBe("better");
  });

  it("takes the goal from the last step planned on exactly that line", () => {
    const line = { measureKey: "joint_range", variant: "knee_flexion_active", side: "right" as const };
    const steps = [
      milestone({ id: "a", linkedMeasureKey: "joint_range", linkedVariant: "knee_flexion_active", linkedSide: "right", targetValue: 90, sortOrder: 1 }),
      milestone({ id: "b", linkedMeasureKey: "joint_range", linkedVariant: "knee_flexion_active", linkedSide: "right", targetValue: 120, sortOrder: 3, status: "reached", reachedAt: "2026-09-01T05:00:00.000Z" }),
      milestone({ id: "c", linkedMeasureKey: "joint_range", linkedVariant: "knee_flexion_active", linkedSide: "left", targetValue: 140, sortOrder: 9 }),
      milestone({ id: "d", linkedMeasureKey: "joint_range", linkedVariant: "knee_flexion_passive", linkedSide: "right", targetValue: 140, sortOrder: 9 }),
      milestone({ id: "e", linkedMeasureKey: "joint_range", linkedVariant: "knee_flexion_active", linkedSide: "right", targetValue: null, sortOrder: 9 }),
    ];
    expect(goalForSeries(line, steps)).toEqual({ value: 120, milestoneId: "b", reached: true });
    expect(goalForSeries({ measureKey: "tug", variant: null, side: null }, steps)).toBeNull();
  });
});
