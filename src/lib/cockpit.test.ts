import { describe, expect, it } from "vitest";
import {
  RUN_REFUSAL_CODES,
  cockpitFailure,
  failureText,
  exertionBlock,
  firstOpenStepId,
  preExerciseFromEvents,
  isLastStep,
  nextStepId,
  patientControls,
  redFlagsRaised,
  resultRows,
  saveReadiness,
  setupProgress,
  stepAvailability,
  stepNav,
  toolMode,
  toolSlots,
} from "@/lib/cockpit";
import { runStateFromEvents, type RunEvent } from "@/lib/assessmentRun";
import type { MeasurementPoint } from "@/lib/outcomeSeries";
import { sessionProtocol, SESSION_PROTOCOLS, protocolStep } from "@/lib/sessionProtocols";

const knee = sessionProtocol("ortho_knee")!;
const cardio = sessionProtocol("cardiopulmonary")!;

let n = 0;
function ev(stepId: string, kind: RunEvent["kind"], extra: Partial<RunEvent> = {}): RunEvent {
  n++;
  return {
    id: `e${n}`,
    runId: "r1",
    stepId,
    kind,
    measurementId: null,
    details: {},
    actor: "t1",
    createdAt: new Date(Date.UTC(2026, 9, 26, 12, 0, n)).toISOString(),
    ...extra,
  };
}
const clear = ev("safety", "safety_confirmed", { details: { gate: "red_flags", answers: { a: false }, flagged: [] } });
const flagged = ev("safety", "safety_confirmed", { details: { gate: "red_flags", answers: { a: true }, flagged: ["a"] } });
const point = (over: Partial<MeasurementPoint>): MeasurementPoint => ({
  id: "m1",
  patientId: "p",
  appointmentId: null,
  measureKey: "chair_stand_30s",
  variant: null,
  side: null,
  value: 11,
  items: null,
  conditions: {},
  recordedBy: "t1",
  recordedByRole: "therapist",
  measuredAt: "2026-10-26T12:00:00.000Z",
  createdAt: "2026-10-26T12:00:00.000Z",
  schemaVersion: 1,
  ...over,
});

describe("the step bar", () => {
  it("opens only the safety step until it is answered", () => {
    const state = runStateFromEvents([]);
    const nav = stepNav(knee, state, "safety");
    expect(nav[0]).toMatchObject({ available: true, current: true, mark: "todo" });
    expect(nav.slice(1).every((s) => !s.available && s.lockedReason)).toBe(true);
  });
  it("leaves only the summary open after a flag", () => {
    const state = runStateFromEvents([flagged]);
    expect(redFlagsRaised(state)).toBe(true);
    const open = stepNav(knee, state, "safety").filter((s) => s.available).map((s) => s.id);
    expect(open).toEqual(["safety", "summary"]);
    expect(firstOpenStepId(knee, state)).toBe("summary");
  });
  it("marks done, skipped and stopped, and resumes on the first unfinished step", () => {
    const state = runStateFromEvents([clear, ev("safety", "saved"), ev("pain", "skipped", { details: { reason: "too_painful" } }), ev("function", "stopped")]);
    const marks = Object.fromEntries(stepNav(knee, state, "function").map((s) => [s.id, s.mark]));
    expect(marks).toMatchObject({ safety: "done", pain: "skipped", function: "stopped", knee_bend: "todo" });
    expect(firstOpenStepId(knee, state)).toBe("function");
  });
  it("starts on the safety step with no answers, and finds the next open step", () => {
    expect(firstOpenStepId(knee, runStateFromEvents([]))).toBe("safety");
    const state = runStateFromEvents([clear]);
    expect(nextStepId(knee, state, "safety")).toBe("pain");
    expect(nextStepId(knee, runStateFromEvents([flagged]), "safety")).toBe("summary");
    expect(nextStepId(knee, state, "summary")).toBeNull();
    expect(isLastStep(knee, "summary")).toBe(true);
    expect(isLastStep(knee, "pain")).toBe(false);
  });
  it("explains why a step is shut", () => {
    const step = protocolStep(knee, "pain")!;
    expect(stepAvailability(knee, runStateFromEvents([]), step).reason).toMatch(/safety/i);
  });
});

describe("what is missing before Save and next", () => {
  const chair = protocolStep(knee, "chair_stand")!;
  const all = new Set(chair.setup.map((s) => s.id));
  it("names the helper first, then the rest of the set-up", () => {
    const helperId = chair.setup.find((s) => s.helper)!.id;
    const noHelper = new Set([...all].filter((id) => id !== helperId));
    expect(saveReadiness({ step: chair, ticked: noHelper, resultReady: true }).missing).toMatch(/another adult/);
    expect(saveReadiness({ step: chair, ticked: new Set(), resultReady: true }).missing).toMatch(/Tick that another adult/);
    const onlyHelper = new Set([helperId]);
    const r = saveReadiness({ step: chair, ticked: onlyHelper, resultReady: true });
    expect(r.ready).toBe(false);
    expect(r.missing).toMatch(/set-up items? above/);
  });
  it("then the safety answers, then the result", () => {
    const safety = protocolStep(knee, "safety")!;
    const ticked = new Set(safety.setup.map((s) => s.id));
    expect(saveReadiness({ step: safety, ticked, redFlags: { answered: 3, total: 5 }, resultReady: false }).missing).toBe("Answer the 2 safety questions still open.");
    expect(saveReadiness({ step: safety, ticked, redFlags: { answered: 4, total: 5 }, resultReady: false }).missing).toBe("Answer the 1 safety question still open.");
    expect(saveReadiness({ step: chair, ticked: all, resultReady: false }).missing).toBe("Take the reading first.");
    expect(saveReadiness({ step: chair, ticked: all, resultReady: false, resultMissing: "Choose left or right." }).missing).toBe("Choose left or right.");
  });
  it("unlocks when everything is in place, and a block wins", () => {
    expect(saveReadiness({ step: chair, ticked: all, resultReady: true })).toEqual({ ready: true, missing: null });
    expect(saveReadiness({ step: chair, ticked: all, resultReady: true, blocked: "No tests today." })).toEqual({ ready: false, missing: "No tests today." });
  });
  it("counts the set-up", () => {
    expect(setupProgress(chair, new Set())).toMatchObject({ total: chair.setup.length, done: 0, helperMissing: true });
  });
});

describe("tools", () => {
  it("picks the tool mode from the step", () => {
    expect(knee.steps.map((s) => toolMode(s))).toEqual(["red_flags", "layer", "measure", "measure", "measure", "measure", "measure", "teach", "summary"]);
  });
  it("gives a vitals step one slot per reading and keeps the variant limits", () => {
    const rest = protocolStep(cardio, "resting_check")!;
    expect(toolSlots(rest).map((s) => s.measureKey)).toEqual(["resting_heart_rate", "blood_pressure", "resting_spo2"]);
    expect(toolSlots(rest).find((s) => s.measureKey === "blood_pressure")?.variants).toEqual(["rest"]);
    const bend = protocolStep(knee, "knee_bend")!;
    expect(toolSlots(bend)).toHaveLength(1);
    expect(toolSlots(bend)[0].variants).toContain("knee_flexion_active");
  });
});

describe("the patient's screen controls", () => {
  it("offers the clock only where the step has one", () => {
    const chair = protocolStep(knee, "chair_stand")!;
    const pain = protocolStep(knee, "pain")!;
    expect(patientControls(chair).map((c) => c.key)).toEqual(["ready", "countdown", "go", "done", "rest"]);
    expect(patientControls(chair).find((c) => c.key === "go")).toMatchObject({ phase: "go", startClock: true });
    expect(patientControls(pain).map((c) => c.key)).toEqual(["ready", "go", "done", "rest"]);
    expect(patientControls(pain).every((c) => !c.startClock)).toBe(true);
  });
});

describe("today's results", () => {
  it("says Not done until a step is saved and shows the readings after", () => {
    const state = runStateFromEvents([clear, ev("safety", "saved"), ev("chair_stand", "saved", { measurementId: "m1" })]);
    const rows = resultRows(knee, state, [point({})]);
    expect(rows.find((r) => r.id === "safety")).toMatchObject({ value: "All clear", tone: "done" });
    expect(rows.find((r) => r.id === "chair_stand")).toMatchObject({ value: "11 stands", tone: "done" });
    expect(rows.find((r) => r.id === "walk")).toMatchObject({ value: "Not done", tone: "todo" });
    expect(rows.some((r) => r.id === "summary")).toBe(false);
  });
  it("says skipped, stopped and flagged honestly", () => {
    const state = runStateFromEvents([flagged, ev("pain", "skipped", { details: { reason: "too_painful" } }), ev("walk", "stopped")]);
    const rows = resultRows(knee, state, []);
    expect(rows.find((r) => r.id === "safety")).toMatchObject({ value: "A concern was noted", tone: "flag" });
    expect(rows.find((r) => r.id === "pain")?.value).toMatch(/^Skipped: too painful/i);
    expect(rows.find((r) => r.id === "walk")).toMatchObject({ value: "Stopped, nothing kept", tone: "stopped" });
    expect(rows.find((r) => r.id === "knee_bend")?.value).toBe("Not done today");
  });
  it("lists the resting vitals one reading at a time", () => {
    const state = runStateFromEvents([
      clear,
      ev("resting_check", "saved", { measurementId: "a" }),
      ev("resting_check", "saved", { measurementId: "b" }),
    ]);
    const rows = resultRows(cardio, state, [
      point({ id: "a", measureKey: "resting_heart_rate", value: 72 }),
      point({ id: "b", measureKey: "blood_pressure", variant: "rest", value: 120, items: { systolic: 120, diastolic: 80 } }),
    ]);
    const vitals = rows.filter((r) => r.id.startsWith("resting_check"));
    expect(vitals.map((r) => r.value)).toEqual(["72 bpm", "120/80 mmHg"]);
  });
  it("joins a test taken in two forms on one row", () => {
    const state = runStateFromEvents([clear, ev("knee_bend", "saved", { measurementId: "a" }), ev("knee_bend", "saved", { measurementId: "b" })]);
    const rows = resultRows(knee, state, [
      point({ id: "a", measureKey: "joint_range", variant: "knee_flexion_active", side: "right", value: 122 }),
      point({ id: "b", measureKey: "joint_range", variant: "knee_flexion_passive", side: "right", value: 130 }),
    ]);
    const row = rows.find((r) => r.id === "knee_bend")!;
    expect(row.value).toContain("122°");
    expect(row.value).toContain("130°");
  });
  it("shows a layer step as recorded", () => {
    const state = runStateFromEvents([clear, ev("pain", "saved", { details: { layer: "pain_map", recordId: "x" } })]);
    expect(resultRows(knee, state, []).find((r) => r.id === "pain")).toMatchObject({ value: "Recorded", tone: "done" });
  });
});

describe("refusal sentences", () => {
  it("has a sentence and a single fix for every run refusal code", () => {
    expect(RUN_REFUSAL_CODES.length).toBeGreaterThan(15);
    for (const code of RUN_REFUSAL_CODES) {
      const f = cockpitFailure({ status: 409, code });
      expect(f.kind).toBe("refused");
      expect(f.message.length).toBeGreaterThan(10);
      expect(f.fix).toBeTruthy();
      expect(f.message).not.toMatch(/not allowed/i);
    }
  });
  it("says could not check for a 503, never not allowed", () => {
    const f = cockpitFailure({ status: 503 });
    expect(f.kind).toBe("unchecked");
    expect(failureText(f)).toMatch(/could not check/i);
    expect(failureText(f)).not.toMatch(/not allowed/i);
  });
  it("treats a 429 as wait", () => {
    expect(cockpitFailure({ status: 429 }).kind).toBe("wait");
  });
  it("keeps the server's own clinical sentence for the cardio stop", () => {
    const f = cockpitFailure({ status: 409, code: "cardio_red_flag", error: "Resting oxygen is 88 percent. Do not exercise today." });
    expect(f.message).toContain("88 percent");
    expect(f.fix).toMatch(/doctor/);
  });
  it("falls back to the shared words for the measurement route's own codes", () => {
    expect(failureText(cockpitFailure({ status: 409, code: "session_not_started" }))).toMatch(/started/i);
  });
});

describe("every protocol", () => {
  it("can be walked by the cockpit's helpers", () => {
    for (const p of SESSION_PROTOCOLS) {
      const state = runStateFromEvents([]);
      expect(stepNav(p, state, p.steps[0].id)).toHaveLength(p.steps.length);
      for (const s of p.steps) {
        expect(["red_flags", "measure", "layer", "teach", "summary"]).toContain(toolMode(s));
        expect(patientControls(s).length).toBeGreaterThanOrEqual(4);
      }
    }
  });
});

describe("the resting check on the heart and lung protocol", () => {
  const check = (status: string) => ev("resting_check", "safety_confirmed", { details: { gate: "cardio_pre_exercise", status, flags: [], notChecked: [] } });
  it("reads the newest check the server wrote", () => {
    expect(preExerciseFromEvents([])).toBeNull();
    expect(preExerciseFromEvents([check("incomplete"), check("clear")])).toBe("clear");
    expect(preExerciseFromEvents([clear])).toBeNull();
  });
  it("holds an exertion step until the check is clear, and says why", () => {
    const sit = protocolStep(cardio, "sit_to_stand")!;
    expect(exertionBlock(cardio, sit, null)).toMatch(/resting check/i);
    expect(exertionBlock(cardio, sit, "incomplete")).toMatch(/resting check/i);
    expect(exertionBlock(cardio, sit, "stop")).toMatch(/not to exercise/i);
    expect(exertionBlock(cardio, sit, "clear")).toBeNull();
    expect(exertionBlock(cardio, protocolStep(cardio, "breathless_now")!, null)).toBeNull();
    expect(exertionBlock(knee, protocolStep(knee, "chair_stand")!, null)).toBeNull();
  });
});
