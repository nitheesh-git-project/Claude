import { describe, expect, it } from "vitest";
import { preExerciseCheck, resolveOxygenStopLimit } from "./cardioSafety";
import { protocolStep, sessionProtocol, SESSION_PROTOCOLS } from "./sessionProtocols";
import {
  buildLiveDisplay,
  checkRunOpen,
  checkRunSave,
  checkStepAction,
  clockReading,
  endedLiveDisplay,
  parseLiveDisplayRow,
  parseRunEventRow,
  parseRunRow,
  preExerciseVitalsFromRun,
  runStateFromEvents,
  validateDisplayRequest,
  validateEndRequest,
  validateLayerSavedDetails,
  validateLiveDisplay,
  validateRedFlagDetails,
  validateSetupDetails,
  validateSkipDetails,
  type AssessmentRun,
  type RunEvent,
} from "./assessmentRun";

const knee = sessionProtocol("ortho_knee")!;
const cardio = sessionProtocol("cardiopulmonary")!;

const RUN: AssessmentRun = {
  id: "run-1",
  patientId: "pat-1",
  appointmentId: null,
  therapistId: "ther-1",
  protocolKey: "ortho_knee",
  protocolVersion: 1,
  profileKind: "ortho",
  status: "in_progress",
  startedAt: "2026-10-26T09:00:00.000Z",
  endedAt: null,
  endedReason: null,
};

let seq = 0;
function ev(stepId: string, kind: RunEvent["kind"], details: Record<string, unknown> = {}, measurementId: string | null = null): RunEvent {
  seq++;
  return {
    id: `e${String(seq).padStart(3, "0")}`,
    runId: "run-1",
    stepId,
    kind,
    measurementId,
    details,
    actor: "ther-1",
    createdAt: new Date(Date.parse("2026-10-26T09:00:00.000Z") + seq * 1000).toISOString(),
  };
}

const allClear = (p = knee) => Object.fromEntries(p.steps[0].redFlags!.map((q) => [q.id, false]));
const redFlagsClear = (p = knee) => ev("safety", "safety_confirmed", validateRedFlagDetails(p.steps[0], { answers: allClear(p) }).ok ? { gate: "red_flags", answers: allClear(p), flagged: [] } : {});
const setup = (p: typeof knee, stepId: string) => {
  const r = validateSetupDetails(protocolStep(p, stepId)!, { items: protocolStep(p, stepId)!.setup.map((s) => s.id) });
  if (!r.ok) throw new Error("setup");
  return ev(stepId, "setup_confirmed", r.details);
};

const video = { setting: "video" as const, helperPresent: true };

describe("rows", () => {
  it("parses a run and an event, refusing a malformed one", () => {
    const run = parseRunRow({
      id: "r", patient_id: "p", appointment_id: null, therapist_id: "t", protocol_key: "ortho_knee", protocol_version: 1,
      profile_kind: "ortho", status: "in_progress", started_at: "2026-10-26T09:00:00Z", ended_at: null, ended_reason: null,
    });
    expect(run?.status).toBe("in_progress");
    expect(parseRunRow({ id: "r", status: "weird" })).toBeNull();
    expect(parseRunEventRow({ id: "e", run_id: "r", step_id: "pain", kind: "stopped", measurement_id: null, details: null, actor: "t", created_at: "2026-10-26T09:00:00Z" })?.details).toEqual({});
    expect(parseRunEventRow({ id: "e", run_id: "r", step_id: "pain", kind: "edited", actor: "t", created_at: "x" })).toBeNull();
  });
});

describe("event details", () => {
  it("set-up is all or nothing, and records the helper", () => {
    const step = protocolStep(knee, "chair_stand")!;
    const partial = validateSetupDetails(step, { items: ["arms_crossed"] });
    expect(partial.ok).toBe(false);
    if (!partial.ok) expect(partial.refusal.code).toBe("setup_incomplete");
    expect(validateSetupDetails(step, { items: ["nonsense"] }).ok).toBe(false);
    const full = validateSetupDetails(step, { items: step.setup.map((s) => s.id) });
    expect(full.ok && full.details.helperPresent).toBe(true);
  });

  it("red flags need every question answered yes or no", () => {
    const step = knee.steps[0];
    const missing = validateRedFlagDetails(step, { answers: { chest_pain_or_breathless: false } });
    expect(!missing.ok && missing.refusal.code).toBe("red_flags_unanswered");
    const flagged = validateRedFlagDetails(step, { answers: { ...allClear(), knee_hot_swollen: true } });
    expect(flagged.ok && flagged.details.flagged).toEqual(["knee_hot_swollen"]);
    expect(validateRedFlagDetails(protocolStep(knee, "pain")!, { answers: {} }).ok).toBe(false);
  });

  it("skips only a skippable step, with a known reason", () => {
    expect(validateSkipDetails(knee.steps[0], {}).ok).toBe(false);
    expect(validateSkipDetails(protocolStep(knee, "walk")!, { reason: "no_helper" })).toEqual({ ok: true, details: { reason: "no_helper" } });
    expect(validateSkipDetails(protocolStep(knee, "walk")!, { reason: "bored" }).ok).toBe(false);
  });

  it("a layer step's save names a record id", () => {
    expect(validateLayerSavedDetails(protocolStep(knee, "pain")!, { recordId: "11111111-1111-4111-8111-111111111111" }).ok).toBe(true);
    expect(validateLayerSavedDetails(protocolStep(knee, "pain")!, { recordId: "x" }).ok).toBe(false);
    expect(validateLayerSavedDetails(protocolStep(knee, "function")!, { recordId: "11111111-1111-4111-8111-111111111111" }).ok).toBe(false);
  });
});

describe("the run gate", () => {
  it("refuses a run that is not open, not yours, or on old steps", () => {
    expect(checkRunOpen(null, { therapistId: "ther-1", protocol: knee })?.status).toBe(404);
    expect(checkRunOpen(RUN, { therapistId: "other", protocol: knee })?.code).toBe("run_not_yours");
    expect(checkRunOpen({ ...RUN, status: "completed" }, { therapistId: "ther-1", protocol: knee })?.code).toBe("run_not_in_progress");
    expect(checkRunOpen({ ...RUN, protocolVersion: 0 }, { therapistId: "ther-1", protocol: knee })?.code).toBe("protocol_changed");
    expect(checkRunOpen(RUN, { therapistId: "ther-1", patientId: "pat-2", protocol: knee })?.code).toBe("run_patient_mismatch");
    expect(checkRunOpen(RUN, { therapistId: "ther-1", patientId: "pat-1", protocol: knee })).toBeNull();
  });

  it("refuses everything after step 1 until the red flags are answered", () => {
    const state = runStateFromEvents([setup(knee, "safety")]);
    expect(checkStepAction({ protocol: knee, step: protocolStep(knee, "function")!, state, action: "setup" })?.code).toBe("red_flags_unanswered");
    // Opening a tab is not refused: it only records where the therapist is.
    expect(checkStepAction({ protocol: knee, step: protocolStep(knee, "function")!, state, action: "open" })).toBeNull();
  });

  it("a red flag present stops every test but leaves the summary open", () => {
    const flagged = ev("safety", "safety_confirmed", { gate: "red_flags", answers: { ...allClear(), unwell_or_fever: true }, flagged: ["unwell_or_fever"] });
    const state = runStateFromEvents([setup(knee, "safety"), flagged]);
    expect(checkStepAction({ protocol: knee, step: protocolStep(knee, "knee_bend")!, state, action: "setup" })?.code).toBe("red_flag_present");
    expect(checkStepAction({ protocol: knee, step: protocolStep(knee, "summary")!, state, action: "setup" })).toBeNull();
    expect(checkStepAction({ protocol: knee, step: protocolStep(knee, "walk")!, state, action: "skip" })).toBeNull();
  });

  it("a save needs the step's own set-up, and a helper where one is needed", () => {
    const base = [setup(knee, "safety"), redFlagsClear()];
    const measurement = { measureKey: "chair_stand_30s", variant: null, conditions: video };
    const noSetup = checkRunSave({ protocol: knee, stepId: "chair_stand", state: runStateFromEvents(base), measurement });
    expect(!noSetup.ok && noSetup.refusal.code).toBe("setup_not_confirmed");

    const noHelperInReading = checkRunSave({
      protocol: knee,
      stepId: "chair_stand",
      state: runStateFromEvents([...base, setup(knee, "chair_stand")]),
      measurement: { ...measurement, conditions: { setting: "video" } },
    });
    expect(!noHelperInReading.ok && noHelperInReading.refusal.code).toBe("helper_not_confirmed");

    // A set-up event that did not confirm the helper (an older client).
    const noHelperEvent = runStateFromEvents([...base, ev("chair_stand", "setup_confirmed", { items: [], helperPresent: false })]);
    const r = checkRunSave({ protocol: knee, stepId: "chair_stand", state: noHelperEvent, measurement });
    expect(!r.ok && r.refusal.code).toBe("helper_not_confirmed");

    const ok = checkRunSave({ protocol: knee, stepId: "chair_stand", state: runStateFromEvents([...base, setup(knee, "chair_stand")]), measurement });
    expect(ok.ok).toBe(true);
  });

  it("refuses a measure the step does not record, an in-person reading, an unknown step and a layer step", () => {
    const state = runStateFromEvents([setup(knee, "safety"), redFlagsClear(), setup(knee, "knee_bend")]);
    const wrongVariant = checkRunSave({
      protocol: knee,
      stepId: "knee_bend",
      state,
      measurement: { measureKey: "joint_range", variant: "shoulder_flexion_active", conditions: { setting: "video" } },
    });
    expect(!wrongVariant.ok && wrongVariant.refusal.code).toBe("measure_not_in_step");
    const inPerson = checkRunSave({
      protocol: knee,
      stepId: "knee_bend",
      state,
      measurement: { measureKey: "joint_range", variant: "knee_flexion_active", conditions: { setting: "in_person" } },
    });
    expect(!inPerson.ok && inPerson.refusal.code).toBe("not_video");
    expect(checkRunSave({ protocol: knee, stepId: "nope", state, measurement: { measureKey: "lefs", variant: null, conditions: video } }).ok).toBe(false);
    const layer = checkRunSave({ protocol: knee, stepId: "pain", state, measurement: { measureKey: "pain_nprs", variant: "now", conditions: video } });
    expect(!layer.ok && layer.refusal.code).toBe("measure_not_in_step");
  });
});

describe("the heart and lung pre-exercise check", () => {
  const limit = resolveOxygenStopLimit({});
  const base = () => [setup(cardio, "safety"), redFlagsClear(cardio), setup(cardio, "resting_check")];
  const vitalsRows = (hr: number, sys: number, dia: number, spo2: number) => [
    { id: "m1", measureKey: "resting_heart_rate", variant: null, value: hr, items: null, measuredAt: "2026-10-26T09:01:00.000Z" },
    { id: "m2", measureKey: "blood_pressure", variant: "rest", value: sys, items: { systolic: sys, diastolic: dia }, measuredAt: "2026-10-26T09:01:00.000Z" },
    { id: "m3", measureKey: "resting_spo2", variant: null, value: spo2, items: null, measuredAt: "2026-10-26T09:01:00.000Z" },
  ];
  const savedVitals = () => [ev("resting_check", "saved", {}, "m1"), ev("resting_check", "saved", {}, "m2"), ev("resting_check", "saved", {}, "m3")];
  const exertion = { measureKey: "one_minute_sit_to_stand", variant: null, conditions: video };

  it("is not recorded when no resting vitals were saved in this run", () => {
    const state = runStateFromEvents([...base(), setup(cardio, "sit_to_stand")]);
    const check = preExerciseCheck(preExerciseVitalsFromRun(cardio, state, []), limit);
    const r = checkRunSave({ protocol: cardio, stepId: "sit_to_stand", state, measurement: exertion, preExercise: check });
    expect(!r.ok && r.refusal.code).toBe("cardio_check_not_recorded");
  });

  it("refuses exertion on a red flag, from this run's own readings", () => {
    const state = runStateFromEvents([...base(), ...savedVitals(), setup(cardio, "sit_to_stand")]);
    const high = preExerciseCheck(preExerciseVitalsFromRun(cardio, state, vitalsRows(130, 150, 90, 96)), limit);
    expect(high.status).toBe("stop");
    const r = checkRunSave({ protocol: cardio, stepId: "sit_to_stand", state, measurement: exertion, preExercise: high });
    expect(!r.ok && r.refusal.code).toBe("cardio_red_flag");
    // The set-up of an exertion step is refused too, so Save and next never unlocks.
    expect(checkStepAction({ protocol: cardio, step: protocolStep(cardio, "sit_to_stand")!, state, action: "setup", preExercise: high })?.code).toBe("cardio_red_flag");
    expect(checkStepAction({ protocol: cardio, step: protocolStep(cardio, "sit_to_stand")!, state, action: "go", preExercise: high })?.code).toBe("cardio_red_flag");
  });

  it("allows exertion once the check is clear", () => {
    const state = runStateFromEvents([...base(), ...savedVitals(), setup(cardio, "sit_to_stand")]);
    const clear = preExerciseCheck(preExerciseVitalsFromRun(cardio, state, vitalsRows(72, 130, 80, 96)), limit);
    expect(clear.status).toBe("clear");
    expect(checkRunSave({ protocol: cardio, stepId: "sit_to_stand", state, measurement: exertion, preExercise: clear }).ok).toBe(true);
  });

  it("ignores readings saved outside the resting step", () => {
    const state = runStateFromEvents([...base(), ev("after_check", "saved", {}, "m1")]);
    expect(preExerciseVitalsFromRun(cardio, state, vitalsRows(72, 130, 80, 96)).restingHeartRate).toBeNull();
  });

  it("a vital sign in a run says it was read off the patient's own device", () => {
    const state = runStateFromEvents([...base()]);
    const r = checkRunSave({ protocol: cardio, stepId: "resting_check", state, measurement: { measureKey: "resting_spo2", variant: null, conditions: { setting: "video", homeMeasured: true } } });
    expect(!r.ok && r.refusal.code).toBe("read_from_required");
    const ok = checkRunSave({
      protocol: cardio,
      stepId: "resting_check",
      state,
      measurement: { measureKey: "resting_spo2", variant: null, conditions: { setting: "video", homeMeasured: true, readFrom: "patient_device_on_video" } },
    });
    expect(ok.ok).toBe(true);
  });
});

describe("stopped and skipped", () => {
  it("a stop keeps no reading and does not undo an earlier save", () => {
    const state = runStateFromEvents([ev("walk", "stopped", { reason: "near_fall" })]);
    expect(state.outcomes.get("walk")).toBe("stopped");
    expect(state.savedMeasurements.get("walk")).toBeUndefined();
    const later = runStateFromEvents([ev("walk", "saved", {}, "m9"), ev("walk", "stopped", {})]);
    expect(later.outcomes.get("walk")).toBe("saved");
  });
});

describe("ending", () => {
  it("needs a reason to abandon and none to complete", () => {
    expect(validateEndRequest({ outcome: "completed" }).ok).toBe(true);
    expect(validateEndRequest({ outcome: "abandoned" }).ok).toBe(false);
    expect(validateEndRequest({ outcome: "abandoned", reason: "connection_lost" }).ok).toBe(true);
    expect(validateEndRequest({ outcome: "completed", reason: "other" }).ok).toBe(false);
    expect(validateEndRequest({ outcome: "paused" }).ok).toBe(false);
  });
});

describe("the live display", () => {
  it("is built from the protocol's own patient text, never from the request", () => {
    const step = protocolStep(knee, "chair_stand")!;
    const go = buildLiveDisplay({ protocol: knee, step, phase: "go", startClock: true });
    expect(go.ok && go.write.clock).toEqual({ mode: "countdown", seconds: 30 });
    expect(go.ok && go.write.display).toEqual({
      progress: "Step 6 of 8",
      title: step.title,
      line: step.patientLine,
      picture: "chair_stand",
      clockLabel: "Time left",
    });
    const ready = buildLiveDisplay({ protocol: knee, step, phase: "ready", startClock: true });
    expect(ready.ok && ready.write.clock).toEqual({ mode: "countdown", seconds: 3 });
    expect(buildLiveDisplay({ protocol: knee, step: protocolStep(knee, "function")!, phase: "go", startClock: true }).ok).toBe(false);
  });

  it("the request carries a step, a phase and the clock only", () => {
    expect(validateDisplayRequest(knee, { runId: "r", stepId: "walk", phase: "go", startClock: true }).ok).toBe(true);
    const text = validateDisplayRequest(knee, { runId: "r", stepId: "walk", phase: "go", line: "You scored 9" });
    expect(text.ok).toBe(false);
    expect(validateDisplayRequest(knee, { stepId: "walk", phase: "sprint" }).ok).toBe(false);
  });

  it("refuses stored text that is not the protocol's, so no result can reach the patient", () => {
    const step = protocolStep(knee, "chair_stand")!;
    const built = buildLiveDisplay({ protocol: knee, step, phase: "done", startClock: false });
    if (!built.ok) throw new Error("build");
    expect(validateLiveDisplay(knee, "chair_stand", built.write.display).ok).toBe(true);
    expect(validateLiveDisplay(knee, "chair_stand", { ...built.write.display, line: "You did 9 stands" }).ok).toBe(false);
    expect(validateLiveDisplay(knee, "chair_stand", { ...built.write.display, result: 9 }).ok).toBe(false);
    expect(validateLiveDisplay(knee, "chair_stand", { ...built.write.display, progress: "Step 9 of 8" }).ok).toBe(false);
    expect(validateLiveDisplay(knee, "chair_stand", endedLiveDisplay(knee).display).ok).toBe(false);
    expect(validateLiveDisplay(knee, "summary", endedLiveDisplay(knee).display).ok).toBe(true);
  });

  it("every protocol's every phase passes its own validator", () => {
    for (const p of SESSION_PROTOCOLS) {
      for (const s of p.steps) {
        for (const phase of ["ready", "go", "done", "rest", "paused"] as const) {
          const b = buildLiveDisplay({ protocol: p, step: s, phase, startClock: false });
          if (!b.ok) throw new Error(`${p.key}.${s.id}`);
          expect(validateLiveDisplay(p, s.id, b.write.display).ok).toBe(true);
          const all = Object.values(b.write.display).join(" ");
          // No digits other than the step counter and the protocol's own scale anchors.
          expect(all.replace(/Step \d+ of \d+/, "").replace(s.patientLine, "").replace(s.title, "")).not.toMatch(/\d/);
        }
      }
    }
  });

  it("parses a stored row for the companion, with its clock", () => {
    const step = protocolStep(knee, "chair_stand")!;
    const b = buildLiveDisplay({ protocol: knee, step, phase: "go", startClock: true });
    if (!b.ok) throw new Error("build");
    const view = parseLiveDisplayRow(
      {
        run_id: "run-1",
        patient_id: "pat-1",
        current_step_id: "chair_stand",
        phase: "go",
        clock_started_at: "2026-10-26T09:00:00.000Z",
        clock_seconds: 30,
        display: b.write.display,
        ended_at: null,
        updated_at: "2026-10-26T09:00:00.000Z",
      },
      () => knee
    );
    expect(view?.clock).toEqual({ mode: "countdown", seconds: 30, startedAt: "2026-10-26T09:00:00.000Z" });
    expect(clockReading(view!.clock!, Date.parse("2026-10-26T09:00:11.500Z"))).toBe(19);
    expect(clockReading(view!.clock!, Date.parse("2026-10-26T09:01:00.000Z"))).toBe(0);
    expect(parseLiveDisplayRow({ run_id: "run-1", current_step_id: "chair_stand", phase: "go", display: { line: "9 stands" }, updated_at: "x" }, () => knee)).toBeNull();
  });
});
