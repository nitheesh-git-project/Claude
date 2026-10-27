import { isProfileKind, isVitalsMeasure, type MeasurementConditions, type ProfileKind } from "@/lib/outcomeMeasures";
import type { PreExerciseCheck, Vitals } from "@/lib/cardioSafety";
import { exerciseByKey, EXERCISE_PICTURES, type Exercise, type ExercisePicture } from "@/lib/exerciseLibrary";
import {
  STOP_REASONS,
  SKIP_REASONS,
  needsPreExerciseCheck,
  requiredSetupItems,
  protocolStep,
  redFlagStep,
  stepIndex,
  stepRecordsMeasure,
  type PatientPicture,
  type ProtocolStep,
  type SessionProtocol,
  type SkipReason,
  type StopReason,
} from "@/lib/sessionProtocols";

// The guided video assessment's run (phase 7a): the rows, the event shapes,
// the gates the server enforces and the patient's live display. Pure and
// dependency-free; the routes (src/app/api/therapist/assessment-runs/*) and
// the measurement route call it with what they read, so every refusal the
// cockpit can meet is a sentence here first and is unit-tested without a
// database.
//
// Three tables (schema.sql, phase 7a): `assessment_runs` (one in progress
// per patient), `assessment_run_events` (append-only by trigger: what the
// therapist confirmed, saved, skipped or stopped, step by step) and
// `assessment_live_display` (one row per run: what the patient's companion
// screen shows -- only the protocol's own patient-safe text, never a result).

// --- Rows ------------------------------------------------------------------------

export type RunStatus = "in_progress" | "completed" | "abandoned";
export const RUN_STATUSES: readonly RunStatus[] = ["in_progress", "completed", "abandoned"];

export type RunEventKind = "setup_confirmed" | "safety_confirmed" | "saved" | "skipped" | "stopped" | "step_opened";
export const RUN_EVENT_KINDS: readonly RunEventKind[] = [
  "setup_confirmed",
  "safety_confirmed",
  "saved",
  "skipped",
  "stopped",
  "step_opened",
];

/** `demo` (phase 7d) is the Home exercises step's "watch how it is done":
 *  only the teach route writes it, never the display route. */
export type LivePhase = "ready" | "go" | "done" | "rest" | "paused" | "demo";
export const LIVE_PHASES: readonly LivePhase[] = ["ready", "go", "done", "rest", "paused", "demo"];

/** Why a run ended early. Fixed words, no free text (nothing to scan). */
export const END_REASONS = {
  red_flag: "A safety question raised a concern",
  patient_unwell: "The patient felt unwell",
  connection_lost: "The video call dropped",
  out_of_time: "Ran out of time",
  patient_declined: "The patient did not want to carry on",
  other: "Another reason",
} as const;
export type EndReason = keyof typeof END_REASONS;

export type AssessmentRun = {
  id: string;
  patientId: string;
  appointmentId: string | null;
  therapistId: string;
  protocolKey: string;
  protocolVersion: number;
  profileKind: ProfileKind;
  status: RunStatus;
  startedAt: string;
  endedAt: string | null;
  endedReason: EndReason | null;
};

export type RunEvent = {
  id: string;
  runId: string;
  stepId: string;
  kind: RunEventKind;
  measurementId: string | null;
  details: Record<string, unknown>;
  actor: string;
  createdAt: string;
};

export const ASSESSMENT_RUN_SELECT =
  "id, patient_id, appointment_id, therapist_id, protocol_key, protocol_version, profile_kind, status, started_at, ended_at, ended_reason";
export const ASSESSMENT_RUN_EVENT_SELECT = "id, run_id, step_id, kind, measurement_id, details, actor, created_at";
export const ASSESSMENT_LIVE_DISPLAY_SELECT =
  "run_id, patient_id, protocol_key, current_step_id, phase, clock_started_at, clock_seconds, display, ended_at, updated_at";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export function parseRunRow(raw: unknown): AssessmentRun | null {
  if (!isObject(raw)) return null;
  const id = str(raw.id);
  const patientId = str(raw.patient_id);
  const therapistId = str(raw.therapist_id);
  const protocolKey = str(raw.protocol_key);
  const startedAt = str(raw.started_at);
  if (!id || !patientId || !therapistId || !protocolKey || !startedAt) return null;
  if (typeof raw.protocol_version !== "number" || !isProfileKind(raw.profile_kind)) return null;
  if (!(RUN_STATUSES as readonly unknown[]).includes(raw.status)) return null;
  const endedReason = typeof raw.ended_reason === "string" && raw.ended_reason in END_REASONS ? (raw.ended_reason as EndReason) : null;
  return {
    id,
    patientId,
    appointmentId: str(raw.appointment_id),
    therapistId,
    protocolKey,
    protocolVersion: raw.protocol_version,
    profileKind: raw.profile_kind,
    status: raw.status as RunStatus,
    startedAt,
    endedAt: str(raw.ended_at),
    endedReason,
  };
}

export function parseRunEventRow(raw: unknown): RunEvent | null {
  if (!isObject(raw)) return null;
  const id = str(raw.id);
  const runId = str(raw.run_id);
  const stepId = str(raw.step_id);
  const actor = str(raw.actor);
  const createdAt = str(raw.created_at);
  if (!id || !runId || !stepId || !actor || !createdAt) return null;
  if (!(RUN_EVENT_KINDS as readonly unknown[]).includes(raw.kind)) return null;
  return {
    id,
    runId,
    stepId,
    kind: raw.kind as RunEventKind,
    measurementId: str(raw.measurement_id),
    details: isObject(raw.details) ? raw.details : {},
    actor,
    createdAt,
  };
}

/** Oldest first; ties broken by id so two readers agree. */
export function orderRunEvents(events: readonly RunEvent[]): RunEvent[] {
  return [...events].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// --- Refusals ----------------------------------------------------------------------

export type RunRefusalCode =
  | "bad_request"
  | "run_not_found"
  | "run_not_yours"
  | "run_not_in_progress"
  | "run_patient_mismatch"
  | "protocol_changed"
  | "unknown_step"
  | "red_flags_unanswered"
  | "red_flag_present"
  | "setup_not_confirmed"
  | "setup_incomplete"
  | "helper_not_confirmed"
  | "measure_not_in_step"
  | "not_video"
  | "read_from_required"
  | "cardio_check_not_recorded"
  | "cardio_red_flag"
  | "not_skippable"
  | "not_a_layer_step"
  | "no_clock"
  /** A save on the Home exercises step before every exercise in the active
   *  plan was marked in this run (phase 7d). */
  | "exercises_not_marked";

export type RunRefusal = { status: 400 | 403 | 404 | 409; code: RunRefusalCode; error: string };

const refuse = (status: RunRefusal["status"], code: RunRefusalCode, error: string): RunRefusal => ({ status, code, error });

// --- Event details ------------------------------------------------------------------

export type RedFlagAnswers = Record<string, boolean>;

export type SetupDetails = { items: string[]; helperPresent: boolean };
export type RedFlagDetails = { gate: "red_flags"; answers: RedFlagAnswers; flagged: string[] };
export type PreExerciseDetails = {
  gate: "cardio_pre_exercise";
  status: PreExerciseCheck["status"];
  flags: string[];
  notChecked: string[];
};
export type LayerSavedDetails = { layer: NonNullable<ProtocolStep["layer"]>; recordId: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Every set-up item ticked, by id. Ticking is all-or-nothing: Save and next
 *  unlocks only when the whole list is ticked, so a partial list is refused.
 *  The one exception is an optional helper item (the Home exercises step):
 *  it may be left unticked, and `helperPresent` says whether it was ticked. */
export function validateSetupDetails(step: ProtocolStep, raw: unknown): { ok: true; details: SetupDetails } | { ok: false; refusal: RunRefusal } {
  const items = isObject(raw) ? raw.items : undefined;
  if (!Array.isArray(items) || items.some((i) => typeof i !== "string")) {
    return { ok: false, refusal: refuse(400, "bad_request", "Send the set-up items that were ticked.") };
  }
  const known = new Set(step.setup.map((s) => s.id));
  const unknown = (items as string[]).filter((i) => !known.has(i));
  if (unknown.length) return { ok: false, refusal: refuse(400, "bad_request", `Unknown set-up item: ${unknown.join(", ")}.`) };
  const ticked = new Set(items as string[]);
  const missing = requiredSetupItems(step).filter((s) => !ticked.has(s.id));
  if (missing.length) {
    return {
      ok: false,
      refusal: refuse(409, "setup_incomplete", `Tick the whole set-up first: ${missing.map((m) => m.label).join("; ")}.`),
    };
  }
  return {
    ok: true,
    details: {
      items: step.setup.filter((s) => ticked.has(s.id)).map((s) => s.id),
      helperPresent: step.setup.some((s) => s.helper === true && ticked.has(s.id)),
    },
  };
}

/** Every red-flag question answered yes or no. "Yes" is a flag. */
export function validateRedFlagDetails(step: ProtocolStep, raw: unknown): { ok: true; details: RedFlagDetails } | { ok: false; refusal: RunRefusal } {
  if (step.tool !== "red_flags" || !step.redFlags) {
    return { ok: false, refusal: refuse(400, "bad_request", "Red-flag answers belong to the safety check.") };
  }
  const answers = isObject(raw) ? raw.answers : undefined;
  if (!isObject(answers)) return { ok: false, refusal: refuse(400, "bad_request", "Send an answer to every safety question.") };
  const ids = new Set(step.redFlags.map((q) => q.id));
  const unknown = Object.keys(answers).filter((k) => !ids.has(k));
  if (unknown.length) return { ok: false, refusal: refuse(400, "bad_request", `Unknown safety question: ${unknown.join(", ")}.`) };
  const clean: RedFlagAnswers = {};
  for (const q of step.redFlags) {
    const a = answers[q.id];
    if (typeof a !== "boolean") {
      return { ok: false, refusal: refuse(409, "red_flags_unanswered", `Answer every safety question first: "${q.question}"`) };
    }
    clean[q.id] = a;
  }
  return {
    ok: true,
    details: { gate: "red_flags", answers: clean, flagged: step.redFlags.filter((q) => clean[q.id]).map((q) => q.id) },
  };
}

export function preExerciseDetails(check: PreExerciseCheck): PreExerciseDetails {
  return {
    gate: "cardio_pre_exercise",
    status: check.status,
    flags: check.flags.map((f) => f.code),
    notChecked: [...check.notChecked],
  };
}

export function readReason<T extends string>(raw: unknown, table: Record<T, string>): { ok: true; reason: T | null } | { ok: false } {
  if (raw === undefined || raw === null || raw === "") return { ok: true, reason: null };
  if (typeof raw === "string" && Object.prototype.hasOwnProperty.call(table, raw)) return { ok: true, reason: raw as T };
  return { ok: false };
}

export function validateSkipDetails(step: ProtocolStep, raw: unknown): { ok: true; details: { reason?: SkipReason } } | { ok: false; refusal: RunRefusal } {
  if (!step.skippable) return { ok: false, refusal: refuse(409, "not_skippable", `${step.title} cannot be skipped.`) };
  const r = readReason(isObject(raw) ? raw.reason : undefined, SKIP_REASONS);
  if (!r.ok) return { ok: false, refusal: refuse(400, "bad_request", "Unknown reason for skipping.") };
  return { ok: true, details: r.reason ? { reason: r.reason } : {} };
}

export function validateStopDetails(raw: unknown): { ok: true; details: { reason?: StopReason } } | { ok: false; refusal: RunRefusal } {
  const r = readReason(isObject(raw) ? raw.reason : undefined, STOP_REASONS);
  if (!r.ok) return { ok: false, refusal: refuse(400, "bad_request", "Unknown reason for stopping.") };
  return { ok: true, details: r.reason ? { reason: r.reason } : {} };
}

/** A layer step's "saved" names the record its own route wrote. */
export function validateLayerSavedDetails(step: ProtocolStep, raw: unknown): { ok: true; details: LayerSavedDetails } | { ok: false; refusal: RunRefusal } {
  if (!step.layer) return { ok: false, refusal: refuse(400, "not_a_layer_step", `${step.title} is saved as a measurement.`) };
  const recordId = isObject(raw) ? raw.recordId : undefined;
  if (!isUuid(recordId)) return { ok: false, refusal: refuse(400, "bad_request", "Name the record that was saved (recordId).") };
  return { ok: true, details: { layer: step.layer, recordId } };
}

// --- State from the events -----------------------------------------------------------

export type StepOutcome = "saved" | "skipped" | "stopped" | "opened" | "not_reached";

export type RunState = {
  /** The latest red-flag answers, or null when the check has not been answered. */
  redFlags: RedFlagDetails | null;
  setupConfirmed: ReadonlySet<string>;
  helperConfirmed: ReadonlySet<string>;
  /** Measurement ids saved in the run, by step. */
  savedMeasurements: ReadonlyMap<string, readonly string[]>;
  /** The latest of saved / skipped / stopped / opened per step. */
  outcomes: ReadonlyMap<string, StepOutcome>;
  /** The latest skip or stop reason per step, when one was given. */
  reasons: ReadonlyMap<string, string>;
};

function parseRedFlagDetails(details: Record<string, unknown>): RedFlagDetails | null {
  if (details.gate !== "red_flags" || !isObject(details.answers) || !Array.isArray(details.flagged)) return null;
  const answers: RedFlagAnswers = {};
  for (const [k, v] of Object.entries(details.answers)) if (typeof v === "boolean") answers[k] = v;
  return { gate: "red_flags", answers, flagged: details.flagged.filter((f): f is string => typeof f === "string") };
}

export function runStateFromEvents(events: readonly RunEvent[]): RunState {
  let redFlags: RedFlagDetails | null = null;
  const setupConfirmed = new Set<string>();
  const helperConfirmed = new Set<string>();
  const saved = new Map<string, string[]>();
  const outcomes = new Map<string, StepOutcome>();
  const reasons = new Map<string, string>();
  for (const e of orderRunEvents(events)) {
    switch (e.kind) {
      case "safety_confirmed": {
        const rf = parseRedFlagDetails(e.details);
        if (rf) redFlags = rf;
        break;
      }
      case "setup_confirmed":
        setupConfirmed.add(e.stepId);
        if (e.details.helperPresent === true) helperConfirmed.add(e.stepId);
        break;
      case "saved":
        outcomes.set(e.stepId, "saved");
        if (e.measurementId) saved.set(e.stepId, [...(saved.get(e.stepId) ?? []), e.measurementId]);
        break;
      case "skipped":
        outcomes.set(e.stepId, "skipped");
        if (typeof e.details.reason === "string") reasons.set(e.stepId, e.details.reason);
        else reasons.delete(e.stepId);
        break;
      case "stopped":
        // A stop after a save does not undo the save: the save is a stored
        // reading and the stop only threw away the attempt after it.
        if (outcomes.get(e.stepId) !== "saved") outcomes.set(e.stepId, "stopped");
        if (typeof e.details.reason === "string") reasons.set(e.stepId, e.details.reason);
        break;
      case "step_opened":
        if (!outcomes.has(e.stepId)) outcomes.set(e.stepId, "opened");
        break;
    }
  }
  return { redFlags, setupConfirmed, helperConfirmed, savedMeasurements: saved, outcomes, reasons };
}

// --- The gates -------------------------------------------------------------------------

/** The run itself: in progress, this therapist's, this patient's, and still
 *  the protocol version it started on. */
export function checkRunOpen(
  run: AssessmentRun | null,
  ctx: { therapistId: string; patientId?: string; protocol: SessionProtocol | null }
): RunRefusal | null {
  if (!run) return refuse(404, "run_not_found", "That assessment could not be found.");
  if (run.therapistId !== ctx.therapistId) return refuse(403, "run_not_yours", "This assessment is being run by another physiotherapist.");
  if (ctx.patientId !== undefined && run.patientId !== ctx.patientId) {
    return refuse(409, "run_patient_mismatch", "That assessment is for a different patient.");
  }
  if (run.status !== "in_progress") return refuse(409, "run_not_in_progress", "This assessment has already ended. Start a new one.");
  if (!ctx.protocol || ctx.protocol.version !== run.protocolVersion) {
    return refuse(409, "protocol_changed", "The assessment steps have changed since this one started. End it and start a new one.");
  }
  return null;
}

export type StepAction = "open" | "setup" | "safety" | "save" | "skip" | "stop" | "go";

/**
 * Whether the therapist may do `action` on `step` now. The order is the
 * clinical order: the red flags answered before anything after step 1; a
 * flag present stops every test (the summary stays open so the session can
 * be closed honestly); the set-up confirmed, with its helper, before a
 * save; and on the heart and lung protocol a clear pre-exercise check before
 * any exertion. `preExercise` is the check worked out from the vitals saved
 * in this run (null when none were saved).
 */
export function checkStepAction(input: {
  protocol: SessionProtocol;
  step: ProtocolStep;
  state: RunState;
  action: StepAction;
  measureKey?: string;
  preExercise?: PreExerciseCheck | null;
}): RunRefusal | null {
  const { protocol, step, state, action } = input;
  const first = redFlagStep(protocol);
  if (step.id !== first.id) {
    if (action !== "open" && action !== "stop" && !state.redFlags) {
      return refuse(409, "red_flags_unanswered", "Answer the safety questions before going on.");
    }
    if (
      state.redFlags &&
      state.redFlags.flagged.length > 0 &&
      step.tool !== "summary" &&
      (action === "setup" || action === "save" || action === "go")
    ) {
      return refuse(409, "red_flag_present", "A safety question was answered yes, so no tests today. Go to the summary.");
    }
  } else if (action === "save" && !state.redFlags) {
    return refuse(409, "red_flags_unanswered", "Answer every safety question first.");
  }

  if (action === "save") {
    if (!state.setupConfirmed.has(step.id)) {
      return refuse(409, "setup_not_confirmed", "Tick the set-up checklist for this step first.");
    }
    if (step.needsHelper && !state.helperConfirmed.has(step.id)) {
      return refuse(409, "helper_not_confirmed", "Confirm that another adult is standing beside the patient first.");
    }
  }

  if ((action === "setup" || action === "save" || action === "go") && needsPreExerciseCheck(protocol, step, input.measureKey)) {
    const check = input.preExercise ?? null;
    if (!check || check.status === "incomplete") {
      return refuse(
        409,
        "cardio_check_not_recorded",
        "Record the resting heart rate, blood pressure and oxygen in the resting check before any exercise."
      );
    }
    if (check.status === "stop") {
      return refuse(409, "cardio_red_flag", check.refusal?.clinician ?? "Do not exercise or test today. Contact the patient's doctor.");
    }
  }
  return null;
}

/**
 * The measurement route's gate inside a run (the step re-derived from the
 * protocol, never trusted from the screen): the measure is one the step
 * records, it was taken over video, a vital sign says it was read off the
 * patient's own device, a step that needs a helper has one in the reading's
 * conditions too -- then checkStepAction("save").
 */
export function checkRunSave(input: {
  protocol: SessionProtocol;
  stepId: string;
  state: RunState;
  measurement: { measureKey: string; variant: string | null; conditions: MeasurementConditions };
  preExercise?: PreExerciseCheck | null;
}): { ok: true; step: ProtocolStep } | { ok: false; refusal: RunRefusal } {
  const step = protocolStep(input.protocol, input.stepId);
  if (!step) return { ok: false, refusal: refuse(400, "unknown_step", "That step is not part of this assessment.") };
  const m = input.measurement;
  if (step.layer) {
    return { ok: false, refusal: refuse(409, "measure_not_in_step", `${step.title} is saved in its own record, not as a measurement.`) };
  }
  if (!stepRecordsMeasure(step, m.measureKey, m.variant)) {
    return { ok: false, refusal: refuse(409, "measure_not_in_step", `That reading is not part of ${step.title}.`) };
  }
  if (m.conditions.setting !== "video") {
    return { ok: false, refusal: refuse(409, "not_video", "A reading in a guided video assessment is taken over video.") };
  }
  if (isVitalsMeasure(m.measureKey) && m.conditions.readFrom !== "patient_device_on_video") {
    return {
      ok: false,
      refusal: refuse(409, "read_from_required", "Mark the reading as read off the patient's own device on camera."),
    };
  }
  if (step.needsHelper && m.conditions.helperPresent !== true) {
    return { ok: false, refusal: refuse(409, "helper_not_confirmed", "Confirm that another adult is standing beside the patient first.") };
  }
  const gate = checkStepAction({
    protocol: input.protocol,
    step,
    state: input.state,
    action: "save",
    measureKey: m.measureKey,
    preExercise: input.preExercise,
  });
  if (gate) return { ok: false, refusal: gate };
  return { ok: true, step };
}

// --- The heart and lung pre-exercise check, from the run's own readings ---------------

export type RunMeasurementLite = {
  id: string;
  measureKey: string;
  variant: string | null;
  value: number;
  items: unknown;
  measuredAt: string;
};

/**
 * The resting vitals saved in the protocol's pre-exercise step of THIS run,
 * newest of each. A reading saved elsewhere, or in another run, is not
 * today's resting check -- so it does not count.
 */
export function preExerciseVitalsFromRun(
  protocol: SessionProtocol,
  state: RunState,
  measurements: readonly RunMeasurementLite[]
): Vitals {
  const stepId = protocol.preExerciseVitalsStepId;
  if (!stepId) return {};
  const ids = new Set(state.savedMeasurements.get(stepId) ?? []);
  const inStep = measurements.filter((m) => ids.has(m.id)).sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt));
  const newest = (key: string, variant?: string) => inStep.find((m) => m.measureKey === key && (variant === undefined || m.variant === variant));
  const hr = newest("resting_heart_rate");
  const bp = newest("blood_pressure", "rest");
  const spo2 = newest("resting_spo2");
  const readings = bp && isObject(bp.items) ? bp.items : null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    restingHeartRate: hr ? hr.value : null,
    systolic: readings ? num(readings.systolic) : null,
    diastolic: readings ? num(readings.diastolic) : null,
    spo2Rest: spo2 ? spo2.value : null,
  };
}

// --- Ending a run ------------------------------------------------------------------------

export function validateEndRequest(raw: unknown): { ok: true; outcome: "completed" | "abandoned"; reason: EndReason | null } | { ok: false; refusal: RunRefusal } {
  if (!isObject(raw)) return { ok: false, refusal: refuse(400, "bad_request", "Nothing to end.") };
  const outcome = raw.outcome;
  if (outcome !== "completed" && outcome !== "abandoned") {
    return { ok: false, refusal: refuse(400, "bad_request", "Say whether the assessment was completed or abandoned.") };
  }
  const r = readReason(raw.reason, END_REASONS);
  if (!r.ok) return { ok: false, refusal: refuse(400, "bad_request", "Unknown reason for ending.") };
  if (outcome === "abandoned" && !r.reason) {
    return { ok: false, refusal: refuse(400, "bad_request", "Say why the assessment ended early.") };
  }
  if (outcome === "completed" && r.reason) {
    return { ok: false, refusal: refuse(400, "bad_request", "A completed assessment has no reason for ending early.") };
  }
  return { ok: true, outcome, reason: r.reason };
}

// --- The patient's live display ----------------------------------------------------------
//
// The companion screen shows ONLY text this module chose from the protocol:
// the step's patient-safe title and line, one of the fixed phase lines, the
// step counter and the clock. The display route takes a step, a phase and
// whether the clock starts -- never text -- so no result, score or note can
// reach the patient's screen through it. validateLiveDisplay() re-checks
// the stored jsonb against the same whitelist on the way in and on the way
// out.

export const READY_COUNTDOWN_SECONDS = 3;

export const PHASE_TEXT: Record<LivePhase, { line: string | null; sub: string | null }> = {
  ready: { line: null, sub: "Get ready. We will start together." },
  go: { line: null, sub: null },
  done: { line: "Well done. You can rest now.", sub: "Take a slow breath. We will talk about it together." },
  rest: { line: "Have a rest.", sub: "We will carry on when you are ready." },
  paused: { line: "Please wait a moment.", sub: "Your physiotherapist will be with you shortly." },
  demo: { line: "Watch how it is done.", sub: "Then you will try it while we watch." },
};

/** The Home exercises step's own lines for the patient's turn (the generic
 *  "go" falls back to the step's line, which says nothing about the
 *  exercise). "demo" and "done" use PHASE_TEXT. */
export const TEACH_GO_TEXT = { line: "Your turn. Show us how you do it.", sub: "Go at your own pace." } as const;

export const ENDED_TEXT = { title: "All done", line: "That is everything for today. Thank you.", picture: "talking" as PatientPicture };

export const CLOCK_LABELS = ["Starting in", "Time left", "Time"] as const;
export type ClockLabel = (typeof CLOCK_LABELS)[number];

/** The exercise being taught, drawn on the companion as a demo: the
 *  library's own picture and steps (never the therapist's text), and which
 *  one of the plan it is. */
export type LiveExerciseDemo = {
  key: string;
  picture: ExercisePicture;
  steps: string[];
  counter: string;
};

export type LiveDisplayText = {
  progress: string;
  title: string;
  line: string;
  sub?: string;
  picture: PatientPicture;
  clockLabel?: ClockLabel;
  /** Only on the Home exercises step (phase 7d). */
  exercise?: LiveExerciseDemo;
};

export type LiveClock = { mode: "countdown"; seconds: number } | { mode: "count_up" };

export type LiveDisplayWrite = {
  currentStepId: string;
  phase: LivePhase;
  /** Null: no clock on screen. */
  clock: LiveClock | null;
  display: LiveDisplayText;
};

export function progressText(protocol: SessionProtocol, step: ProtocolStep): string {
  return `Step ${stepIndex(protocol, step.id) + 1} of ${protocol.steps.length}`;
}

/** What the display route stores for a step, phase and clock request. */
export function buildLiveDisplay(input: {
  protocol: SessionProtocol;
  step: ProtocolStep;
  phase: LivePhase;
  startClock: boolean;
}): { ok: true; write: LiveDisplayWrite } | { ok: false; refusal: RunRefusal } {
  const { protocol, step, phase, startClock } = input;
  let clock: LiveClock | null = null;
  if (startClock) {
    if (!step.clock) return { ok: false, refusal: refuse(400, "no_clock", `${step.title} has no clock.`) };
    if (phase === "ready") clock = { mode: "countdown", seconds: READY_COUNTDOWN_SECONDS };
    else if (phase === "go") clock = step.clock.kind === "countdown" ? { mode: "countdown", seconds: step.clock.seconds } : { mode: "count_up" };
    else return { ok: false, refusal: refuse(400, "no_clock", "The clock runs only while getting ready or during the test.") };
  }
  const phaseText = PHASE_TEXT[phase];
  const display: LiveDisplayText = {
    progress: progressText(protocol, step),
    title: step.title,
    line: phaseText.line ?? step.patientLine,
    picture: step.patientPicture,
  };
  if (phaseText.sub) display.sub = phaseText.sub;
  if (clock) display.clockLabel = phase === "ready" ? "Starting in" : clock.mode === "countdown" ? "Time left" : "Time";
  return { ok: true, write: { currentStepId: step.id, phase, clock, display } };
}

/** The display shown once a run has ended. */
export function endedLiveDisplay(protocol: SessionProtocol): LiveDisplayWrite {
  const last = protocol.steps[protocol.steps.length - 1];
  return {
    currentStepId: last.id,
    phase: "done",
    clock: null,
    display: { progress: progressText(protocol, last), title: ENDED_TEXT.title, line: ENDED_TEXT.line, picture: ENDED_TEXT.picture },
  };
}

export type TeachPhase = "demo" | "go" | "done";
export const TEACH_PHASES: readonly TeachPhase[] = ["demo", "go", "done"];

export const EXERCISE_COUNTER_MAX = 12;

export function exerciseCounterText(index: number, total: number): string {
  return `Exercise ${index + 1} of ${total}`;
}

function parseExerciseCounter(text: unknown): { n: number; total: number } | null {
  if (typeof text !== "string") return null;
  const m = /^Exercise (\d{1,2}) of (\d{1,2})$/.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  const total = Number(m[2]);
  if (n < 1 || total < 1 || n > total || total > EXERCISE_COUNTER_MAX) return null;
  return { n, total };
}

/**
 * The companion's demo of one exercise on the Home exercises step: the
 * exercise's name as the title, the phase's fixed line, and the library's
 * own picture and steps. `index` and `total` are its place in the plan.
 * No clock -- the physiotherapist counts with the patient.
 */
export function buildExerciseDisplay(input: {
  protocol: SessionProtocol;
  step: ProtocolStep;
  exercise: Exercise;
  phase: TeachPhase;
  index: number;
  total: number;
}): { ok: true; write: LiveDisplayWrite } | { ok: false; refusal: RunRefusal } {
  const { protocol, step, exercise, phase, index, total } = input;
  if (step.tool !== "teach_exercises") return { ok: false, refusal: refuse(400, "unknown_step", "Exercises are shown on the Home exercises step.") };
  if (!Number.isInteger(index) || !Number.isInteger(total) || index < 0 || index >= total || total > EXERCISE_COUNTER_MAX) {
    return { ok: false, refusal: refuse(400, "bad_request", "That exercise is not in the plan.") };
  }
  const text = phase === "go" ? TEACH_GO_TEXT : PHASE_TEXT[phase];
  const display: LiveDisplayText = {
    progress: progressText(protocol, step),
    title: exercise.name,
    line: text.line ?? step.patientLine,
    picture: step.patientPicture,
    exercise: { key: exercise.key, picture: exercise.picture, steps: [...exercise.steps], counter: exerciseCounterText(index, total) },
  };
  if (text.sub) display.sub = text.sub;
  return { ok: true, write: { currentStepId: step.id, phase, clock: null, display } };
}

function validateExerciseDemo(raw: unknown): { ok: true; demo: LiveExerciseDemo; exercise: Exercise } | { ok: false; error: string } {
  if (!isObject(raw)) return { ok: false, error: "The exercise is not readable." };
  const extra = Object.keys(raw).filter((k) => !["key", "picture", "steps", "counter"].includes(k));
  if (extra.length) return { ok: false, error: `Not patient-safe: exercise.${extra.join(", exercise.")}.` };
  const exercise = typeof raw.key === "string" ? exerciseByKey(raw.key) : null;
  if (!exercise) return { ok: false, error: "Unknown exercise." };
  if (raw.picture !== exercise.picture || !(EXERCISE_PICTURES as readonly unknown[]).includes(raw.picture)) {
    return { ok: false, error: "The picture is not this exercise's." };
  }
  const steps = raw.steps;
  if (!Array.isArray(steps) || steps.length !== exercise.steps.length || steps.some((s, i) => s !== exercise.steps[i])) {
    return { ok: false, error: "The steps are not this exercise's." };
  }
  if (!parseExerciseCounter(raw.counter)) return { ok: false, error: "The exercise counter is not readable." };
  return {
    ok: true,
    exercise,
    demo: { key: exercise.key, picture: exercise.picture, steps: [...exercise.steps], counter: raw.counter as string },
  };
}

const DISPLAY_KEYS = new Set(["progress", "title", "line", "sub", "picture", "clockLabel", "exercise"]);

/**
 * The stored display jsonb is patient-safe: only the known keys, and every
 * value one of the protocol's own patient strings for that step (or a fixed
 * phase line, the ended screen, the step counter, a clock label). Anything
 * else -- a number that is not the counter, a result, a note -- is refused.
 */
export function validateLiveDisplay(
  protocol: SessionProtocol,
  stepId: string,
  raw: unknown
): { ok: true; display: LiveDisplayText } | { ok: false; error: string } {
  const step = protocolStep(protocol, stepId);
  if (!step) return { ok: false, error: "Unknown step." };
  if (!isObject(raw)) return { ok: false, error: "No display." };
  const extra = Object.keys(raw).filter((k) => !DISPLAY_KEYS.has(k));
  if (extra.length) return { ok: false, error: `Not patient-safe: ${extra.join(", ")}.` };
  if (raw.progress !== progressText(protocol, step)) return { ok: false, error: "The step counter does not match the step." };
  // The Home exercises step may carry one exercise's demo; its title is then
  // that exercise's name, and the patient's-turn lines are allowed too.
  let demo: LiveExerciseDemo | undefined;
  const titles = new Set([step.title, ENDED_TEXT.title]);
  const teachLines: string[] = [];
  if (raw.exercise !== undefined) {
    if (step.tool !== "teach_exercises") return { ok: false, error: "Only the Home exercises step shows an exercise." };
    const checked = validateExerciseDemo(raw.exercise);
    if (!checked.ok) return checked;
    demo = checked.demo;
    titles.clear();
    titles.add(checked.exercise.name);
    teachLines.push(TEACH_GO_TEXT.line);
  }
  const lines = new Set([
    step.patientLine,
    ENDED_TEXT.line,
    ...teachLines,
    ...Object.values(PHASE_TEXT).map((p) => p.line).filter((l): l is string => !!l),
  ]);
  const subs = new Set([
    ...(demo ? [TEACH_GO_TEXT.sub] : []),
    ...Object.values(PHASE_TEXT).map((p) => p.sub).filter((l): l is string => !!l),
  ]);
  if (typeof raw.title !== "string" || !titles.has(raw.title)) return { ok: false, error: "The title is not this step's." };
  if (typeof raw.line !== "string" || !lines.has(raw.line)) return { ok: false, error: "The line is not this step's." };
  if (raw.sub !== undefined && (typeof raw.sub !== "string" || !subs.has(raw.sub))) return { ok: false, error: "The second line is not a phase line." };
  if (raw.picture !== step.patientPicture && raw.picture !== ENDED_TEXT.picture) return { ok: false, error: "The picture is not this step's." };
  if (raw.clockLabel !== undefined && !(CLOCK_LABELS as readonly unknown[]).includes(raw.clockLabel)) {
    return { ok: false, error: "Unknown clock label." };
  }
  if (demo && raw.clockLabel !== undefined) return { ok: false, error: "An exercise demo has no clock." };
  const display: LiveDisplayText = { progress: raw.progress, title: raw.title, line: raw.line, picture: raw.picture as PatientPicture };
  if (typeof raw.sub === "string") display.sub = raw.sub;
  if (typeof raw.clockLabel === "string") display.clockLabel = raw.clockLabel as ClockLabel;
  if (demo) display.exercise = demo;
  return { ok: true, display };
}

/** What the patient's companion reads. `serverNow` lets the screen correct
 *  for its own clock being off when it draws the countdown. */
export type LiveDisplayView = {
  runId: string;
  stepId: string;
  phase: LivePhase;
  clock: (LiveClock & { startedAt: string }) | null;
  text: LiveDisplayText;
  ended: boolean;
  updatedAt: string;
};

export function parseLiveDisplayRow(raw: unknown, protocolFor: (protocolKey: string) => SessionProtocol | null): LiveDisplayView | null {
  if (!isObject(raw)) return null;
  const runId = str(raw.run_id);
  const stepId = str(raw.current_step_id);
  const updatedAt = str(raw.updated_at);
  if (!runId || !stepId || !updatedAt) return null;
  if (!(LIVE_PHASES as readonly unknown[]).includes(raw.phase)) return null;
  const protocolKey = str(raw.protocol_key);
  const protocol = protocolKey ? protocolFor(protocolKey) : null;
  if (!protocol) return null;
  const checked = validateLiveDisplay(protocol, stepId, raw.display);
  if (!checked.ok) return null;
  const startedAt = str(raw.clock_started_at);
  let clock: LiveDisplayView["clock"] = null;
  if (startedAt) {
    clock =
      typeof raw.clock_seconds === "number" && Number.isInteger(raw.clock_seconds) && raw.clock_seconds > 0
        ? { mode: "countdown", seconds: raw.clock_seconds, startedAt }
        : { mode: "count_up", startedAt };
  }
  return { runId, stepId, phase: raw.phase as LivePhase, clock, text: checked.display, ended: !!str(raw.ended_at), updatedAt };
}

/** Seconds left on a countdown (never below 0), or elapsed on a count-up. */
export function clockReading(clock: NonNullable<LiveDisplayView["clock"]>, nowMs: number): number {
  const elapsed = Math.max(0, Math.floor((nowMs - Date.parse(clock.startedAt)) / 1000));
  return clock.mode === "countdown" ? Math.max(0, clock.seconds - elapsed) : elapsed;
}

/** The display request as the cockpit sends it: a step, a phase, whether
 *  the clock starts. No text. */
export function validateDisplayRequest(
  protocol: SessionProtocol,
  raw: unknown
): { ok: true; step: ProtocolStep; phase: LivePhase; startClock: boolean } | { ok: false; refusal: RunRefusal } {
  if (!isObject(raw)) return { ok: false, refusal: refuse(400, "bad_request", "Nothing to show.") };
  const extra = Object.keys(raw).filter((k) => !["runId", "stepId", "phase", "startClock"].includes(k));
  if (extra.length) return { ok: false, refusal: refuse(400, "bad_request", `The display takes a step, a phase and the clock only (${extra.join(", ")}).`) };
  const step = typeof raw.stepId === "string" ? protocolStep(protocol, raw.stepId) : null;
  if (!step) return { ok: false, refusal: refuse(400, "unknown_step", "That step is not part of this assessment.") };
  if (!(LIVE_PHASES as readonly unknown[]).includes(raw.phase)) return { ok: false, refusal: refuse(400, "bad_request", "Unknown phase.") };
  if (raw.phase === "demo") {
    return { ok: false, refusal: refuse(400, "bad_request", "An exercise demo is shown from the Home exercises step.") };
  }
  if (raw.startClock !== undefined && typeof raw.startClock !== "boolean") {
    return { ok: false, refusal: refuse(400, "bad_request", "startClock must be true or false.") };
  }
  return { ok: true, step, phase: raw.phase as LivePhase, startClock: raw.startClock === true };
}
