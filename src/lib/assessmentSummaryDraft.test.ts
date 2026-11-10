import { describe, expect, it } from "vitest";
import { sessionProtocol } from "./sessionProtocols";
import { assessmentSummaryDraft, type SummaryMeasurement } from "./assessmentSummaryDraft";
import { validateMeasurementConditions } from "./outcomeMeasures";
import { readFromLabel } from "./outcomeSeries";
import type { AssessmentRun, RunEvent } from "./assessmentRun";
import type { TeachingEvent } from "./exercisePlan";

const knee = sessionProtocol("ortho_knee")!;
const RUN: AssessmentRun = {
  id: "run-1",
  patientId: "p",
  appointmentId: null,
  therapistId: "t",
  protocolKey: "ortho_knee",
  protocolVersion: 2,
  profileKind: "ortho",
  status: "completed",
  startedAt: "2026-10-26T09:00:00.000Z",
  endedAt: "2026-10-26T09:40:00.000Z",
  endedReason: null,
};

let n = 0;
const ev = (stepId: string, kind: RunEvent["kind"], details: Record<string, unknown> = {}, measurementId: string | null = null): RunEvent => ({
  id: `e${String(++n).padStart(3, "0")}`,
  runId: "run-1",
  stepId,
  kind,
  measurementId,
  details,
  actor: "t",
  createdAt: new Date(Date.parse("2026-10-26T09:00:00.000Z") + n * 1000).toISOString(),
});
const clear = ev("safety", "safety_confirmed", { gate: "red_flags", answers: {}, flagged: [] });

const ROWS: SummaryMeasurement[] = [
  { id: "m-lefs", measureKey: "lefs", variant: null, side: null, value: 58 },
  { id: "m-bend", measureKey: "joint_range", variant: "knee_flexion_active", side: "right", value: 118 },
  { id: "m-stray", measureKey: "chair_stand_30s", variant: null, side: null, value: 14 },
];

describe("assessmentSummaryDraft", () => {
  const events = [
    clear,
    ev("function", "saved", {}, "m-lefs"),
    ev("knee_bend", "saved", {}, "m-bend"),
    ev("chair_stand", "stopped", { reason: "symptoms" }),
    ev("walk", "skipped", { reason: "no_helper" }),
  ];

  it("states only what was saved and names the skipped and stopped steps", () => {
    const text = assessmentSummaryDraft({ run: RUN, protocol: knee, events, measurements: ROWS, profileKind: "ortho", voice: "clinician" })!;
    expect(text).toContain("2 of 6 tests recorded");
    expect(text).toContain("everyday tasks 58 out of 80");
    expect(text).toContain("knee bend (active) 118°, right");
    expect(text).toContain("Skipped walking speed (no one could stand beside the patient)");
    expect(text).toContain("stopped sit to stand for 30 seconds (symptoms during the test) before the end, nothing kept");
    // A row the run never saved is never a result.
    expect(text).not.toContain("14");
    const sentences = text.split(/(?<=\.)\s/);
    expect(sentences.length).toBeGreaterThanOrEqual(2);
    expect(sentences.length).toBeLessThanOrEqual(4);
  });

  it("speaks to the patient in their own words", () => {
    const text = assessmentSummaryDraft({ run: RUN, protocol: knee, events, measurements: ROWS, profileKind: "ortho", voice: "patient" })!;
    expect(text).toMatch(/^In today's video session we did 2 of the 6 checks together\./);
    expect(text).toContain("We left out walking speed (no one could stand beside you)");
    expect(text).not.toMatch(/patient/i);
  });

  it("says a red flag stopped the tests, and a layer step is named without a number", () => {
    const flagged = [ev("safety", "safety_confirmed", { gate: "red_flags", answers: { unwell_or_fever: true }, flagged: ["unwell_or_fever"] })];
    expect(assessmentSummaryDraft({ run: RUN, protocol: knee, events: flagged, measurements: [], profileKind: "ortho", voice: "clinician" })).toBe(
      "Guided video assessment: no tests recorded. A red-flag question was answered yes, so testing stopped."
    );
    const pain = [clear, ev("pain", "saved", { layer: "pain_map", recordId: "x" })];
    expect(assessmentSummaryDraft({ run: RUN, protocol: knee, events: pain, measurements: [], profileKind: "ortho", voice: "clinician" })).toContain(
      "Results: pain score recorded."
    );
  });

  it("names an early end, and is null when nothing happened", () => {
    const abandoned = { ...RUN, status: "abandoned" as const, endedReason: "connection_lost" as const };
    const text = assessmentSummaryDraft({ run: abandoned, protocol: knee, events: [clear, ev("function", "saved", {}, "m-lefs")], measurements: ROWS, profileKind: "ortho", voice: "patient" })!;
    expect(text).toContain("We finished early because the video call dropped.");
    expect(assessmentSummaryDraft({ run: RUN, protocol: knee, events: [], measurements: [], profileKind: "ortho", voice: "patient" })).toBeNull();
  });
});

describe("assessmentSummaryDraft: home exercises (phase 7d)", () => {
  const taught = (exerciseKey: string, outcome: TeachingEvent["outcome"], extra: Partial<TeachingEvent> = {}): TeachingEvent => ({
    id: `t-${exerciseKey}`,
    kind: "mark",
    correctsEventId: null,
    correctionReason: null,
    runId: "run-1",
    planId: "plan-1",
    patientId: "p",
    exerciseKey,
    outcome,
    cueKey: null,
    reasonKey: null,
    helperPresent: false,
    actor: "t",
    createdAt: "2026-10-26T09:30:00.000Z",
    ...extra,
  });

  it("says what was taught and never counts the step as a test", () => {
    const events = [clear, ev("function", "saved", {}, "m-lefs"), ev("exercises", "saved")];
    const teaching = [
      taught("sit_to_stand", "performed_correctly"),
      taught("heel_raise", "needs_practice", { cueKey: "hold_support" }),
      taught("walking", "performed_correctly", { runId: "another-run" }),
    ];
    const text = assessmentSummaryDraft({ run: RUN, protocol: knee, events, measurements: ROWS, profileKind: "ortho", voice: "patient", teaching })!;
    expect(text).toContain("1 of the 6 checks");
    expect(text).toContain("We practised 2 home exercises together: sit to stand went well, and heel raise needs more practice.");
    expect(text).not.toContain("daily walk");
  });

  it("says when the exercises were skipped", () => {
    const events = [clear, ev("function", "saved", {}, "m-lefs"), ev("exercises", "skipped", { reason: "out_of_time" })];
    expect(assessmentSummaryDraft({ run: RUN, protocol: knee, events, measurements: ROWS, profileKind: "ortho", voice: "clinician" })).toContain(
      "Home exercises skipped."
    );
  });
});

describe("vitals read off the patient's own device", () => {
  const ctx = (measureKey: string) => ({ measureKey, profileKind: "cardiopulmonary" as const, measuredAtMs: Date.parse("2026-10-26T09:00:00Z") });

  it("is a vitals-only condition that must match the setting", () => {
    expect(validateMeasurementConditions({ setting: "video", homeMeasured: true, readFrom: "patient_device_on_video" }, ctx("resting_spo2"))).toEqual({
      ok: true,
      conditions: { setting: "video", homeMeasured: true, readFrom: "patient_device_on_video" },
    });
    expect(validateMeasurementConditions({ setting: "in_person", readFrom: "patient_device_on_video" }, ctx("resting_spo2")).ok).toBe(false);
    expect(validateMeasurementConditions({ setting: "video", homeMeasured: true, readFrom: "clinic_device" }, ctx("resting_spo2")).ok).toBe(false);
    expect(validateMeasurementConditions({ setting: "in_person", readFrom: "clinic_device" }, ctx("resting_heart_rate")).ok).toBe(true);
    expect(validateMeasurementConditions({ setting: "video", readFrom: "patient_device_on_video" }, ctx("talk_test")).ok).toBe(false);
    expect(validateMeasurementConditions({ setting: "video", homeMeasured: true, readFrom: "a_guess" }, ctx("resting_spo2")).ok).toBe(false);
  });

  it("is labelled only when read on camera", () => {
    expect(readFromLabel({ readFrom: "patient_device_on_video" })).toBe("Read off the patient's own device on video");
    expect(readFromLabel({ readFrom: "clinic_device" })).toBeNull();
    expect(readFromLabel({ readFrom: null })).toBeNull();
  });
});
