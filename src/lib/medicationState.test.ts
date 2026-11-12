import { describe, expect, it } from "vitest";
import { needsMedicationState, validateMeasurementConditions } from "@/lib/outcomeMeasures";
import { buildMeasureSeries, measureTableRows, parseMeasurementRows, pointsAreComparable } from "@/lib/outcomeSeries";

// Parkinson's medication state (Health Profile redesign, phase 4a). The four
// mobility tests the owner named must carry ON/OFF and the last dose on the
// Parkinson's sub-profile (validateMeasurementConditions is what both
// measurement routes run, through prepareMeasurement), and the graph only
// joins readings taken in the same known state.

const NOW = Date.parse("2026-10-20T06:30:00.000Z");
const DOSE = new Date(NOW - 2 * 3_600_000).toISOString();
const FOUR = ["tug", "ten_metre_walk", "five_sit_to_stand", "mini_bestest"] as const;

describe("medication state on the Parkinson's sub-profile", () => {
  it("is required for TUG, the 10-metre walk, five times sit-to-stand and the Mini-BESTest", () => {
    for (const key of FOUR) {
      expect(needsMedicationState(key, "neuro_parkinsons"), key).toBe(true);
      expect(needsMedicationState(key, "neuro"), key).toBe(false);
    }
  });

  it("refuses a missing ON/OFF or a missing last-dose time, for each of the four", () => {
    for (const key of FOUR) {
      const ctx = { measureKey: key, profileKind: "neuro_parkinsons" as const, measuredAtMs: NOW };
      expect(validateMeasurementConditions({ setting: "in_person" }, ctx).ok, `${key} without state`).toBe(false);
      expect(validateMeasurementConditions({ setting: "in_person", medicationState: "off" }, ctx).ok, `${key} without dose`).toBe(false);
      expect(validateMeasurementConditions({ setting: "in_person", lastDoseAt: DOSE }, ctx).ok, `${key} without ON/OFF`).toBe(false);
      expect(
        validateMeasurementConditions({ setting: "in_person", medicationState: "off", lastDoseAt: DOSE }, ctx).ok,
        `${key} complete`
      ).toBe(true);
    }
  });
});

describe("pointsAreComparable", () => {
  it("joins only the same known state on a Parkinson's medication-state measure", () => {
    expect(pointsAreComparable("tug", "neuro_parkinsons", "on", "on")).toBe(true);
    expect(pointsAreComparable("tug", "neuro_parkinsons", "on", "off")).toBe(false);
    expect(pointsAreComparable("tug", "neuro_parkinsons", null, null)).toBe(false);
    expect(pointsAreComparable("mini_bestest", "neuro_parkinsons", "off", undefined)).toBe(false);
  });

  it("ignores the state everywhere else", () => {
    expect(pointsAreComparable("tug", "geriatric", "on", "off")).toBe(true);
    expect(pointsAreComparable("mini_bestest", "neuro", null, "on")).toBe(true);
    expect(pointsAreComparable("lefs", "neuro_parkinsons", null, null)).toBe(true);
  });
});

describe("the Parkinson's graph and table", () => {
  let seq = 0;
  const row = (value: number, at: string, conditions: Record<string, unknown>) => ({
    id: `m${++seq}`, patient_id: "p", appointment_id: null, measure_key: "mini_bestest", variant: null, side: null,
    value, items: null, conditions, recorded_by: "t", recorded_by_role: "therapist", measured_at: at, schema_version: 1, created_at: at,
  });

  it("splits ON from OFF, and leaves readings with no recorded state unjoined and unjudged", () => {
    const on = { setting: "in_person", medicationState: "on", lastDoseAt: "2026-08-01T03:00:00.000Z" };
    const off = { ...on, medicationState: "off" };
    const unknown = { setting: "in_person" };
    const pts = parseMeasurementRows([
      row(14, "2026-08-01T05:00:00.000Z", on),
      row(20, "2026-09-01T05:00:00.000Z", on),
      row(10, "2026-08-02T05:00:00.000Z", off),
      row(12, "2026-09-02T05:00:00.000Z", off),
      // Recorded while the record was plain neurological, before the route asked.
      row(15, "2026-06-01T05:00:00.000Z", unknown),
      row(22, "2026-07-01T05:00:00.000Z", unknown),
    ]);
    const series = buildMeasureSeries(pts, { profileKind: "neuro_parkinsons" });
    expect(series.map((s) => [s.medicationState, s.joinPoints, s.points.length])).toEqual([
      ["on", true, 2],
      ["off", true, 2],
      [null, false, 2],
    ]);
    const rows = measureTableRows(series, [], { profileKind: "neuro_parkinsons" });
    expect(rows.find((r) => r.medicationState === "on")?.change).not.toBeNull();
    const unjoined = rows.find((r) => r.medicationState === null)!;
    expect(unjoined.change).toBeNull();
    expect(unjoined.meaningful).toBeNull();
    // ...and says why, so the table can label it rather than leave "Not judged" unexplained.
    expect(unjoined.stateUnrecorded).toBe(true);
    expect(rows.find((r) => r.medicationState === "on")?.stateUnrecorded).toBeUndefined();

    // The same readings on an ordinary neurological record are one line.
    const neuro = buildMeasureSeries(pts, { profileKind: "neuro" });
    expect(neuro).toHaveLength(1);
    expect(neuro[0].joinPoints).toBe(true);
  });
});
