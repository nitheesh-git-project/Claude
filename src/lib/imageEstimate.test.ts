import { describe, expect, it } from "vitest";
import { outcomeMeasure, validateMeasurement, validateMeasurementConditions } from "@/lib/outcomeMeasures";
import { buildConditions, EMPTY_CONDITION_DRAFT } from "@/lib/recordTest";
import { buildMeasureSeries, measureTableRows, parseMeasurementRows } from "@/lib/outcomeSeries";
import { buildProgressExport } from "@/lib/progressExport";

const NOW = Date.parse("2026-10-20T10:00:00.000Z");
const ctx = { measureKey: "joint_range", profileKind: "ortho" as const, measuredAtMs: NOW };
const joint = outcomeMeasure("joint_range")!;

describe("estimated from an image: the stored provenance", () => {
  it("is built only for a joint range taken over video", () => {
    const draft = { ...EMPTY_CONDITION_DRAFT, setting: "video" as const, estimatedFromImage: true };
    expect(buildConditions(joint, "ortho", draft, NOW).estimatedFromImage).toBe(true);
    expect(buildConditions(joint, "ortho", { ...draft, setting: "in_person" }, NOW).estimatedFromImage).toBeUndefined();
    expect(buildConditions(joint, "ortho", { ...draft, estimatedFromImage: false }, NOW).estimatedFromImage).toBeUndefined();
    expect(buildConditions(outcomeMeasure("tug")!, "ortho", draft, NOW).estimatedFromImage).toBeUndefined();
  });
  it("is accepted for joint range over video and refused anywhere else", () => {
    expect(validateMeasurementConditions({ setting: "video", estimatedFromImage: true }, ctx)).toMatchObject({ ok: true });
    expect(validateMeasurementConditions({ setting: "in_person", estimatedFromImage: true }, ctx)).toMatchObject({ ok: false });
    expect(validateMeasurementConditions({ setting: "video", estimatedFromImage: true }, { ...ctx, measureKey: "tug" })).toMatchObject({ ok: false });
    expect(validateMeasurementConditions({ setting: "video", estimatedFromImage: "yes" }, ctx)).toMatchObject({ ok: false });
    const kept = validateMeasurementConditions({ setting: "video", estimatedFromImage: false }, ctx);
    expect(kept.ok && kept.conditions.estimatedFromImage).toBeUndefined();
  });
  it("travels through the whole measurement check", () => {
    const checked = validateMeasurement(
      {
        measureKey: "joint_range",
        value: 95,
        measuredAt: new Date(NOW).toISOString(),
        side: "left",
        variant: "knee_flexion_active",
        conditions: { setting: "video", estimatedFromImage: true },
      },
      { profileKind: "ortho", nowMs: NOW, enabledLicensed: new Set() }
    );
    expect(checked.ok && checked.measurement.conditions.estimatedFromImage).toBe(true);
  });
});

function row(over: Record<string, unknown>, n: number): Record<string, unknown> {
  return {
    id: `m${n}`,
    patient_id: "p1",
    appointment_id: null,
    measure_key: "joint_range",
    variant: "knee_flexion_active",
    side: "left",
    value: 90,
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

describe("estimated from an image: first and now", () => {
  const estimate = { setting: "video", estimatedFromImage: true };
  it("marks the point, and keeps a goniometer reading from the same review in front of a later estimate", () => {
    const pts = parseMeasurementRows([
      row({ id: "a", value: 92, appointment_id: "s1", measured_at: "2026-09-01T05:00:00.000Z" }, 1),
      row({ id: "b", value: 99, appointment_id: "s1", conditions: estimate, measured_at: "2026-09-01T05:20:00.000Z" }, 2),
      row({ id: "c", value: 101, appointment_id: "s2", conditions: estimate, measured_at: "2026-09-08T05:00:00.000Z" }, 3),
    ]);
    const [line] = buildMeasureSeries(pts, { profileKind: "ortho" });
    expect(line.points.map((p) => [p.value, p.estimatedFromImage])).toEqual([
      [92, false],
      [101, true],
    ]);
  });
  it("labels an estimate in the measures table and in the PDF's rows", () => {
    const pts = parseMeasurementRows([
      row({ id: "a", value: 92, appointment_id: "s1" }, 1),
      row({ id: "c", value: 101, appointment_id: "s2", conditions: estimate, measured_at: "2026-09-08T05:00:00.000Z" }, 2),
    ]);
    const rows = measureTableRows(buildMeasureSeries(pts, { profileKind: "ortho" }), [], { profileKind: "ortho" });
    expect(rows[0].first.estimatedFromImage).toBe(false);
    expect(rows[0].now.estimatedFromImage).toBe(true);
    const exported = buildProgressExport({ profileKind: "ortho", careStatus: undefined, points: pts, goals: [], milestones: [], nowMs: NOW });
    expect(exported.measures[0].now.toLowerCase()).toContain("estimated from a photo");
    expect(exported.measures[0].first.toLowerCase()).not.toContain("estimated from a photo");
  });
});
