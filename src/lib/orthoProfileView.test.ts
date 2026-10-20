import { describe, expect, it } from "vitest";
import { shapeOrthoView, type OrthoReads } from "@/lib/orthoProfileView";
import type { OutcomeMeasurementRow } from "@/lib/outcomeSeries";
import type { CareStatusEvent } from "@/lib/careStatus";

const row = (id: string, key: string, variant: string | null, side: string | null, value: number, at: string): OutcomeMeasurementRow => ({
  id,
  patient_id: "p",
  appointment_id: null,
  measure_key: key,
  variant,
  side,
  value,
  items: null,
  conditions: { setting: "in_person" },
  recorded_by: "t1",
  recorded_by_role: "therapist",
  measured_at: at,
  schema_version: 1,
  created_at: at,
});

const reads = (over: Partial<OrthoReads> = {}): OrthoReads => ({
  measurements: {
    status: "ok",
    rows: [
      row("a", "joint_range", "knee_flexion_active", "right", 85, "2026-08-01T05:00:00.000Z"),
      row("b", "joint_range", "knee_flexion_active", "right", 122, "2026-09-12T05:00:00.000Z"),
    ],
  },
  goals: { status: "ok", activeGoal: null, goals: [], milestones: [] },
  careStatus: { status: "ok", events: [] },
  assessments: [
    { region: "knee", side: "right", pain_percent: 70, created_at: "2026-08-01T05:00:00.000Z" },
    { region: "knee", side: "right", pain_percent: 30, created_at: "2026-09-12T05:00:00.000Z" },
  ],
  ...over,
});

const NOW = Date.parse("2026-10-01T05:00:00.000Z");

describe("shapeOrthoView", () => {
  it("draws pain from the Pain Map and the knee from the table", () => {
    const v = shapeOrthoView(reads(), "patient", NOW);
    expect(v.series.map((s) => s.measureKey)).toEqual(["pain_nprs", "joint_range"]);
    expect(v.computed.status).toBe("improving");
    expect(v.kneeBend).toMatchObject({ now: 122, first: 85 });
    expect(v.areas).toHaveLength(1);
    expect(v.measuresFailed || v.goalsFailed || v.statusFailed).toBe(false);
    expect(v.lastReviewAt).toBe("2026-09-12T05:00:00.000Z");
  });

  it("degrades one card at a time: an unreadable measurement read keeps the Pain Map", () => {
    const v = shapeOrthoView(reads({ measurements: { status: "unreadable" } }), "clinician", NOW);
    expect(v.measuresFailed).toBe(true);
    expect(v.goalsFailed).toBe(false);
    expect(v.series.map((s) => s.measureKey)).toEqual(["pain_nprs"]);
    expect(v.kneeBend).toBeNull();
    expect(v.areas).toHaveLength(1);
  });

  it("marks an unreadable goal read and an unreadable status read separately", () => {
    const v = shapeOrthoView(reads({ goals: { status: "unreadable" }, careStatus: { status: "unreadable" } }), "patient", NOW);
    expect(v.goalsFailed).toBe(true);
    expect(v.statusFailed).toBe(true);
    expect(v.measuresFailed).toBe(false);
    expect(v.override).toBeNull();
  });

  it("applies the stored phase and the override from the event history", () => {
    const events: CareStatusEvent[] = [
      { id: "e1", patientId: "p", kind: "phase", value: "Strengthen", reason: null, profileKind: "ortho", setBy: "t", setByRole: "therapist", createdAt: "2026-09-13T05:00:00.000Z" },
      { id: "e2", patientId: "p", kind: "status_override", value: "needs_attention", reason: "Swelling came back after the stairs test.", profileKind: "ortho", setBy: "t", setByRole: "therapist", createdAt: "2026-09-14T05:00:00.000Z" },
    ];
    const v = shapeOrthoView(reads({ careStatus: { status: "ok", events } }), "clinician", NOW);
    expect(v.phase).toBe("Strengthen");
    expect(v.phaseIsInferred).toBe(false);
    expect(v.override).toMatchObject({ status: "needs_attention", stale: false });
  });
});
