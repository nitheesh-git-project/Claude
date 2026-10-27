import { describe, expect, it } from "vitest";
import { shapeNeuroView, type NeuroReads } from "@/lib/neuroProfileView";
import type { OutcomeMeasurementRow } from "@/lib/outcomeSeries";
import type { NeuroAssessmentRow } from "@/lib/neuroExam";
import type { CareStatusEvent } from "@/lib/careStatus";
import type { DiaryEntry } from "@/lib/patientDiary";

const NOW = Date.parse("2026-10-20T06:30:00Z");

const row = (id: string, key: string, value: number, at: string, conditions: Record<string, unknown> = {}, items: unknown = null): OutcomeMeasurementRow =>
  ({
    id,
    patient_id: "p",
    appointment_id: null,
    measure_key: key,
    variant: null,
    side: null,
    value,
    items,
    conditions: { setting: "in_person", ...conditions },
    recorded_by: "t1",
    recorded_by_role: "therapist",
    measured_at: at,
    schema_version: 1,
    created_at: at,
  }) as OutcomeMeasurementRow;

const examRow = (id: string, at: string, findings: Record<string, unknown>): NeuroAssessmentRow => ({
  id,
  created_at: at,
  submitted_by_role: "therapist",
  schema_version: 1,
  findings,
});

const fall = (over: Partial<DiaryEntry> = {}): DiaryEntry =>
  ({
    id: "d1",
    patientId: "p",
    kind: "fall",
    occurredAt: "2026-10-15T05:00:00Z",
    details: { injured: false },
    note: null,
    enteredBy: "p",
    enteredByRole: "patient",
    confirmedBy: null,
    confirmedByRole: null,
    confirmedAt: null,
    createdAt: "2026-10-15T05:05:00Z",
    ...over,
  }) as DiaryEntry;

const reads = (over: Partial<NeuroReads> = {}): NeuroReads => ({
  measurements: {
    status: "ok",
    rows: [row("a", "fac", 2, "2026-08-01T05:00:00Z"), row("b", "fac", 4, "2026-10-01T05:00:00Z")],
  },
  goals: { status: "ok", activeGoal: null, goals: [], milestones: [] },
  careStatus: { status: "ok", events: [] },
  diary: { status: "ok", entries: [] },
  intakeHistory: { status: "ok", rows: [] },
  licence: { status: "ok", keys: [] },
  exams: [
    examRow("e1", "2026-08-01T05:00:00Z", { bilateral: {}, balance: { bergTotal: 28 }, gait: { patterns: [], aids: [], tenMetreWalkSeconds: 25 } }),
    examRow("e2", "2026-10-01T05:00:00Z", { bilateral: {}, balance: { bergTotal: 46 }, gait: { patterns: [], aids: [], tenMetreWalkSeconds: 14 } }),
  ],
  examsFailed: false,
  ...over,
});

const ctx = { kind: "neuro" as const, intake: { neuro_diagnosis: "Stroke, 2 Jun 2026\nsecond line", neuro_affected_side: "Left side", neuro_falls: "One" }, voice: "clinician" as const, nowMs: NOW };

describe("shapeNeuroView", () => {
  it("builds the lines from both stores with no double counting, and the picture from the exam and FAC", () => {
    const v = shapeNeuroView(reads({ measurements: { status: "ok", rows: [row("x", "berg_balance", 10, "2026-07-01T05:00:00Z"), row("a", "fac", 2, "2026-08-01T05:00:00Z"), row("b", "fac", 4, "2026-10-01T05:00:00Z")] } }), ctx);
    expect(v.series.map((s) => s.measureKey)).toEqual(["berg_balance", "ten_metre_walk", "fac"]);
    expect(v.series[0].points.map((p) => p.value)).toEqual([28, 46]);
    expect(v.recordedSeries.map((s) => s.measureKey)).toContain("berg_balance");
    expect(v.ladder?.now).toBe(4);
    expect(v.speed?.nowBand).toBe("limited");
    expect(v.affected?.leftLeg).toBe(true);
    expect(v.conditionLine).toBe("Stroke, 2 Jun 2026");
    expect(v.keyTiles).toHaveLength(4);
    expect(v.parkinsons).toBeNull();
    expect(v.lastReviewAt).toBe("2026-10-01T05:00:00Z");
  });

  it("keeps the pill on the numbers for an unconfirmed fall and turns it for a confirmed one", () => {
    const unconfirmed = shapeNeuroView(reads({ diary: { status: "ok", entries: [fall()] } }), ctx);
    expect(unconfirmed.computed.status).toBe("improving");
    expect(unconfirmed.diary.status === "ok" && unconfirmed.diary.awaiting).toHaveLength(1);
    const confirmed = shapeNeuroView(reads({ diary: { status: "ok", entries: [fall({ confirmedAt: "2026-10-16T05:00:00Z", confirmedBy: "t1", confirmedByRole: "therapist" })] } }), ctx);
    expect(confirmed.computed).toMatchObject({ status: "needs_attention", reason: "new_fall" });
  });

  it("says unreadable is not empty, source by source", () => {
    const v = shapeNeuroView(
      reads({ diary: { status: "unreadable" }, examsFailed: true, measurements: { status: "unreadable" }, intakeHistory: { status: "unreadable" }, careStatus: { status: "unreadable" } }),
      ctx
    );
    expect(v.diary.status).toBe("unreadable");
    expect(v.examsFailed && v.measuresFailed && v.statusFailed).toBe(true);
    expect(v.keyTiles.map((t) => t.valueText)).toEqual(["Unavailable", "Unavailable", "Unavailable", "Unavailable"]);
    expect(v.computed.status).toBe("unknown");
  });

  it("uses the Barthel Index for independence only when its licence is on", () => {
    const rows = [row("a", "barthel", 45, "2026-08-01T05:00:00Z"), row("b", "barthel", 80, "2026-10-01T05:00:00Z")];
    const off = shapeNeuroView(reads({ measurements: { status: "ok", rows } }), ctx);
    expect(off.keyTiles[0].key).toBe("independence-intake");
    const on = shapeNeuroView(reads({ measurements: { status: "ok", rows }, licence: { status: "ok", keys: ["barthel"] } }), ctx);
    expect(on.keyTiles[0].valueText).toBe("80");
  });

  it("names the physiotherapist on the written summary", () => {
    const events: CareStatusEvent[] = [
      { id: "s1", patientId: "p", kind: "summary", value: "Doing well.", reason: null, profileKind: "neuro", setBy: "t1", setByRole: "therapist", createdAt: "2026-10-12T05:00:00Z" },
    ];
    const v = shapeNeuroView(reads({ careStatus: { status: "ok", events }, summaryAuthorName: "Dr Farhan Sheikh" }), ctx);
    expect(v.stand.source === "written" && v.stand.authorName).toBe("Dr Farhan Sheikh");
  });

  it("Parkinson's: ON-time chip, diary bars, stage and symptom profile; a mixed-state record claims nothing", () => {
    const on = { medicationState: "on", lastDoseAt: "2026-10-12T04:00:00.000Z" };
    const rows = [
      row("1", "tug", 14.2, "2026-08-03T05:00:00Z", { ...on, lastDoseAt: "2026-08-03T04:00:00.000Z" }),
      row("2", "tug", 10.8, "2026-10-12T05:00:00Z", on),
      row("3", "hoehn_yahr", 2.5, "2026-10-12T05:00:00Z", on),
      row("4", "pd_symptom_rating", 9, "2026-10-12T05:00:00Z", on, [2, 2, 2, 1, 1, 1]),
    ];
    const v = shapeNeuroView(
      reads({
        measurements: { status: "ok", rows },
        exams: [],
        diary: { status: "ok", entries: [{ ...fall(), id: "f", kind: "freezing", details: { period: "week", count: 4, trigger: "turning" } } as DiaryEntry] },
      }),
      { ...ctx, kind: "neuro_parkinsons", intake: { neuro_subtype: "Parkinson's disease" } }
    );
    expect(v.parkinsons?.onTimeChip).toMatch(/^Tested in ON time/);
    expect(v.parkinsons?.stage?.value).toBe(2.5);
    expect(v.parkinsons?.symptoms?.rows).toHaveLength(6);
    expect(v.parkinsons?.bars).toHaveLength(12);
    expect(v.graphSeries.some((s) => s.measureKey === "hoehn_yahr")).toBe(false);
    expect(v.series.some((s) => s.measureKey === "berg_balance")).toBe(false);
    expect(v.keyTiles[0].label).toBe("Up-and-go (ON)");
    expect(v.subtype).toBe("Parkinson's disease");
  });
});
