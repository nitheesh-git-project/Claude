import { splitJointVariant } from "@/lib/jointLandmarks";
import { outcomeMeasure } from "@/lib/outcomeMeasures";
import type { MeasurementPoint } from "@/lib/outcomeSeries";
import { formatReading } from "@/lib/progressChart";
import { NETWORK_ERROR_MESSAGE, progressErrorMessage, type ProgressApiFailure } from "@/lib/progressErrors";
import {
  SKIP_REASONS,
  STOP_REASONS,
  protocolStep,
  redFlagStep,
  stepIndex,
  needsPreExerciseCheck,
  type ProtocolStep,
  type SessionProtocol,
} from "@/lib/sessionProtocols";
import { orderRunEvents, type LivePhase, type RunEvent, type RunRefusalCode, type RunState } from "@/lib/assessmentRun";

// The session cockpit's logic (Health Profile redesign, phase 7b), kept out
// of the components so it is tested without a browser: which step the person
// lands on, what each tab in the step bar says, what is still missing before
// Save and next unlocks, the rows of "Today's results", what the patient's
// screen can be told, and one plain sentence plus the single fix for every
// refusal the server can give. The server is the gate (assessmentRun.ts); this
// only makes the screen say, in advance and afterwards, what the gate says.

// --- The step bar ------------------------------------------------------------------

export type StepMark = "done" | "skipped" | "stopped" | "todo";

export type StepNavItem = {
  id: string;
  index: number;
  short: string;
  title: string;
  mark: StepMark;
  current: boolean;
  /** False while the clinical order keeps this step shut. */
  available: boolean;
  /** Why it is shut, as a sentence; null when it is open. */
  lockedReason: string | null;
};

/** Any red-flag question answered yes: no test is open today, only the summary. */
export function redFlagsRaised(state: RunState): boolean {
  return (state.redFlags?.flagged.length ?? 0) > 0;
}

function markFor(state: RunState, stepId: string): StepMark {
  const outcome = state.outcomes.get(stepId);
  if (outcome === "saved") return "done";
  if (outcome === "skipped") return "skipped";
  if (outcome === "stopped") return "stopped";
  return "todo";
}

/** Whether a step can be opened now, and if not, why. Step 1 is always open;
 *  nothing else opens until the safety questions are answered; once one was
 *  answered yes only the summary opens (the server refuses the rest too). */
export function stepAvailability(protocol: SessionProtocol, state: RunState, step: ProtocolStep): { available: boolean; reason: string | null } {
  const first = redFlagStep(protocol);
  if (step.id === first.id) return { available: true, reason: null };
  if (!state.redFlags) return { available: false, reason: "Answer the safety questions first." };
  if (redFlagsRaised(state) && step.tool !== "summary") {
    return { available: false, reason: "A safety question was answered yes, so no tests today. Go to the summary." };
  }
  return { available: true, reason: null };
}

export function stepNav(protocol: SessionProtocol, state: RunState, currentId: string): StepNavItem[] {
  return protocol.steps.map((step, index) => {
    const open = stepAvailability(protocol, state, step);
    return {
      id: step.id,
      index,
      short: step.short,
      title: step.title,
      mark: markFor(state, step.id),
      current: step.id === currentId,
      available: open.available,
      lockedReason: open.reason,
    };
  });
}

/** The step a resumed run opens on: the first the person has not finished
 *  (saved or skipped), the summary once a flag was raised, else the last. */
export function firstOpenStepId(protocol: SessionProtocol, state: RunState): string {
  if (!state.redFlags) return redFlagStep(protocol).id;
  const open = protocol.steps.filter((s) => stepAvailability(protocol, state, s).available);
  const unfinished = open.find((s) => {
    // The safety step is finished once its questions are answered, saved or not.
    if (s.tool === "red_flags") return false;
    const outcome = state.outcomes.get(s.id);
    return outcome !== "saved" && outcome !== "skipped";
  });
  return (unfinished ?? open[open.length - 1] ?? protocol.steps[0]).id;
}

/** The step after `fromId` that can be opened, or null at the end. */
export function nextStepId(protocol: SessionProtocol, state: RunState, fromId: string): string | null {
  const from = stepIndex(protocol, fromId);
  for (let i = from + 1; i < protocol.steps.length; i++) {
    if (stepAvailability(protocol, state, protocol.steps[i]).available) return protocol.steps[i].id;
  }
  return null;
}

export function isLastStep(protocol: SessionProtocol, stepId: string): boolean {
  return stepIndex(protocol, stepId) === protocol.steps.length - 1;
}

// --- Set-up and what is missing --------------------------------------------------------

/** An optional item (the Home exercises step's helper) never holds Save and
 *  next back; it is counted only once ticked. */
export function setupProgress(step: ProtocolStep, ticked: ReadonlySet<string>): { total: number; done: number; remaining: number; helperMissing: boolean } {
  const required = step.setup.filter((s) => s.optional !== true);
  const done = required.filter((s) => ticked.has(s.id)).length;
  return {
    total: required.length,
    done,
    remaining: required.length - done,
    helperMissing: required.some((s) => s.helper === true && !ticked.has(s.id)),
  };
}

export type Readiness = { ready: boolean; missing: string | null };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Whether Save and next may unlock, and the one thing standing in the way,
 * said as a sentence under the button. The order is the order a person does
 * things in: the set-up first (the helper named on its own, it is the safety
 * item), then the red-flag answers, then the result itself.
 */
export function saveReadiness(input: {
  step: ProtocolStep;
  ticked: ReadonlySet<string>;
  /** The safety step only: how many questions are answered. */
  redFlags?: { answered: number; total: number };
  resultReady: boolean;
  /** The tool's own sentence for what is missing from the result. */
  resultMissing?: string | null;
  /** The step cannot be saved at all (a flag was raised, no safety answers yet). */
  blocked?: string | null;
}): Readiness {
  const { step } = input;
  if (input.blocked) return { ready: false, missing: input.blocked };
  const setup = setupProgress(step, input.ticked);
  if (setup.helperMissing) return { ready: false, missing: "Tick that another adult is standing beside the patient." };
  if (setup.remaining > 0) {
    return { ready: false, missing: `Tick the ${setup.remaining} set-up ${plural(setup.remaining, "item", "items")} above.` };
  }
  if (input.redFlags && input.redFlags.answered < input.redFlags.total) {
    const open = input.redFlags.total - input.redFlags.answered;
    return { ready: false, missing: `Answer the ${open} safety ${plural(open, "question", "questions")} still open.` };
  }
  if (!input.resultReady) return { ready: false, missing: input.resultMissing ?? "Take the reading first." };
  return { ready: true, missing: null };
}

export const READY_NOTE = "Stop test throws this reading away. Nothing is saved until Save and next.";

// --- Which tool a step shows ---------------------------------------------------------------

/** `teach` is the Home exercises step (phase 7d): pick, dose, demo, watch,
 *  mark -- its screen is phase 7d-2. */
export type ToolMode = "red_flags" | "measure" | "layer" | "teach" | "summary";

export function toolMode(step: ProtocolStep): ToolMode {
  if (step.tool === "red_flags") return "red_flags";
  if (step.tool === "summary") return "summary";
  if (step.tool === "teach_exercises") return "teach";
  if (step.layer) return "layer";
  return "measure";
}

/** The readings a measurement step takes, one slot each. A slot with
 *  `variants` is one test the step may record in only some of its forms. */
export function toolSlots(step: ProtocolStep): { key: string; measureKey: string; variants?: readonly string[] }[] {
  return step.measures.map((m) => ({
    key: `${m.measureKey}:${(m.variants ?? []).join("|")}`,
    measureKey: m.measureKey,
    ...(m.variants ? { variants: m.variants } : {}),
  }));
}

// --- The patient's screen -------------------------------------------------------------------

export type PatientControl = { key: string; label: string; phase: LivePhase; startClock: boolean };

/** What the therapist can show on the patient's screen for a step. Only a
 *  phase and whether the clock starts: never words (the server picks them). */
export function patientControls(step: ProtocolStep): PatientControl[] {
  const controls: PatientControl[] = [{ key: "ready", label: "Get ready", phase: "ready", startClock: false }];
  if (step.clock) controls.push({ key: "countdown", label: "Count 3, 2, 1", phase: "ready", startClock: true });
  controls.push({ key: "go", label: step.clock ? "Go and start the clock" : "Go", phase: "go", startClock: !!step.clock });
  controls.push({ key: "done", label: "Done", phase: "done", startClock: false });
  controls.push({ key: "rest", label: "Rest", phase: "rest", startClock: false });
  return controls;
}

// --- Today's results --------------------------------------------------------------------------

export type ResultTone = "done" | "todo" | "skipped" | "stopped" | "flag";

export type ResultRow = { id: string; label: string; value: string; tone: ResultTone };

function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function readingValue(m: MeasurementPoint): string {
  const measure = outcomeMeasure(m.measureKey);
  const items = m.items && typeof m.items === "object" && !Array.isArray(m.items) ? (m.items as Record<string, unknown>) : null;
  if (m.measureKey === "blood_pressure" && items && typeof items.systolic === "number" && typeof items.diastolic === "number") {
    return `${items.systolic}/${items.diastolic} mmHg`;
  }
  if (!measure) return String(m.value);
  const text = formatReading(m.value, measure.decimals, measure.unit);
  return /^0-(\d+)$/.test(measure.unit) ? `${text} out of ${measure.unit.slice(2)}` : text;
}

/** "Right, active" for a sided, variant reading; empty when there is nothing to add. */
function readingQualifier(m: MeasurementPoint): string {
  const measure = outcomeMeasure(m.measureKey);
  const joint = m.measureKey === "joint_range" ? splitJointVariant(m.variant) : null;
  const variant = joint ? joint.mode : measure?.variants?.find((v) => v.key === m.variant)?.label ?? null;
  const parts = [m.side ? m.side.charAt(0).toUpperCase() + m.side.slice(1) : null, variant ? lowerFirst(variant) : null].filter(Boolean);
  return parts.join(", ");
}

/**
 * "Today's results so far": one row per step that records something, one
 * per reading when a step takes several (the resting vitals), with
 * "Not done" until the step is saved, and the skipped or stopped state said
 * as such. Values come from the measurements the run's saved events point at.
 */
export function resultRows(protocol: SessionProtocol, state: RunState, measurements: readonly MeasurementPoint[]): ResultRow[] {
  const byId = new Map(measurements.map((m) => [m.id, m]));
  const rows: ResultRow[] = [];
  const flagged = redFlagsRaised(state);
  for (const step of protocol.steps) {
    if (step.tool === "summary") continue;
    if (step.tool === "red_flags") {
      rows.push({
        id: step.id,
        label: step.title,
        value: !state.redFlags ? "Not done" : flagged ? "A concern was noted" : "All clear",
        tone: !state.redFlags ? "todo" : flagged ? "flag" : "done",
      });
      continue;
    }
    const outcome = state.outcomes.get(step.id);
    const savedIds = state.savedMeasurements.get(step.id) ?? [];
    const saved = savedIds.map((id) => byId.get(id)).filter((m): m is MeasurementPoint => !!m);
    if (outcome === "skipped") {
      const reason = state.reasons.get(step.id);
      rows.push({
        id: step.id,
        label: step.title,
        value: reason && reason in SKIP_REASONS ? `Skipped: ${lowerFirst(SKIP_REASONS[reason as keyof typeof SKIP_REASONS])}` : "Skipped",
        tone: "skipped",
      });
      continue;
    }
    if (outcome === "saved" && step.layer) {
      rows.push({ id: step.id, label: step.title, value: "Recorded", tone: "done" });
      continue;
    }
    if (outcome === "saved" && saved.length > 0) {
      if (step.measures.length > 1) {
        for (const m of saved) {
          const measure = outcomeMeasure(m.measureKey);
          const q = readingQualifier(m);
          rows.push({ id: `${step.id}:${m.id}`, label: `${measure?.label ?? m.measureKey}${q ? ` (${q})` : ""}`, value: readingValue(m), tone: "done" });
        }
      } else {
        // One test, perhaps more than once (the knee bend: active, passive).
        const parts = saved.map((m) => {
          const q = readingQualifier(m);
          return q && saved.length > 1 ? `${readingValue(m)} (${q})` : readingValue(m);
        });
        const q = saved.length === 1 ? readingQualifier(saved[0]) : "";
        rows.push({ id: step.id, label: q ? `${step.title} (${q})` : step.title, value: parts.join(" · "), tone: "done" });
      }
      continue;
    }
    if (outcome === "saved") {
      rows.push({ id: step.id, label: step.title, value: "Recorded", tone: "done" });
      continue;
    }
    rows.push({
      id: step.id,
      label: step.title,
      value: outcome === "stopped" ? "Stopped, nothing kept" : flagged ? "Not done today" : "Not done",
      tone: outcome === "stopped" ? "stopped" : "todo",
    });
  }
  return rows;
}

// --- Words for every refusal -----------------------------------------------------------------------

export type CockpitFailure = {
  /** What happened, one sentence. */
  message: string;
  /** The one thing to do about it; null when there is nothing to do but wait. */
  fix: string | null;
  /** A check that could not be run, or a wait, is not a refusal. */
  kind: "refused" | "unchecked" | "wait" | "offline";
};

const BY_RUN_CODE: Record<RunRefusalCode, { message: string; fix: string | null }> = {
  bad_request: { message: "That did not go through.", fix: "Reload the page and try again." },
  run_not_found: { message: "That assessment could not be found.", fix: "Go back to the chart and start it again." },
  run_not_yours: { message: "This assessment is being run by another physiotherapist.", fix: "Ask them to carry on, or ask the clinic." },
  run_not_in_progress: { message: "This assessment has already ended.", fix: "Start a new one from the chart." },
  run_patient_mismatch: { message: "That assessment is for a different patient.", fix: "Go back to the chart of the patient you are seeing." },
  protocol_changed: { message: "The assessment steps have changed since this one started.", fix: "End it and start a new one." },
  unknown_step: { message: "That step is not part of this assessment.", fix: "Reload the page." },
  red_flags_unanswered: { message: "The safety questions have not all been answered.", fix: "Go to the Safety step and answer every question." },
  red_flag_present: { message: "A safety question was answered yes, so no tests today.", fix: "Go to the summary." },
  setup_not_confirmed: { message: "The set-up for this step is not confirmed yet.", fix: "Tick every set-up item, then save again." },
  setup_incomplete: { message: "Part of the set-up is still unticked.", fix: "Tick every set-up item, then save again." },
  helper_not_confirmed: { message: "Nobody is confirmed as standing beside the patient.", fix: "Tick that another adult is beside the patient." },
  measure_not_in_step: { message: "That reading is not part of this step.", fix: "Record the test this step asks for." },
  not_video: { message: "A reading in a video assessment has to be taken over video.", fix: "Record it as a video reading." },
  read_from_required: {
    message: "A vital sign has to say where it was read from.",
    fix: "Tick that you read it off the patient's own device on camera.",
  },
  cardio_check_not_recorded: {
    message: "The resting heart rate, blood pressure and oxygen are not all recorded yet.",
    fix: "Save the resting check before any exercise.",
  },
  cardio_red_flag: { message: "The resting check says not to exercise today.", fix: "Skip the exercise steps and contact the patient's doctor." },
  not_skippable: { message: "This step cannot be skipped.", fix: "Finish it, or end the assessment." },
  not_a_layer_step: { message: "This step is saved as a reading, not as an exam record.", fix: "Enter the reading and save again." },
  no_clock: { message: "This step has no clock.", fix: "Use Get ready or Go without the clock." },
  exercises_not_marked: {
    message: "Not every exercise in the plan is marked yet.",
    fix: "Mark each one performed correctly, needs practice or not attempted, or skip the step.",
  },
};

export const RUN_REFUSAL_CODES = Object.keys(BY_RUN_CODE) as RunRefusalCode[];

/**
 * The sentence for a failed request from the run routes, the measurement
 * route or the display route. A coded run refusal has one fixed sentence and
 * one fix; a 503 is "we could not check", never "not allowed"; a 429 is "wait".
 */
export function cockpitFailure(failure: ProgressApiFailure): CockpitFailure {
  const code = typeof failure.code === "string" ? failure.code : null;
  if (code === "cardio_red_flag" && typeof failure.error === "string" && failure.error.trim()) {
    return { message: failure.error.trim(), fix: BY_RUN_CODE.cardio_red_flag.fix, kind: "refused" };
  }
  if (code && Object.prototype.hasOwnProperty.call(BY_RUN_CODE, code)) {
    const hit = BY_RUN_CODE[code as RunRefusalCode];
    return { ...hit, kind: "refused" };
  }
  if (code === "run_in_progress") {
    return { message: "An assessment is already in progress for this patient.", fix: "Carry on with it, or end it first.", kind: "refused" };
  }
  if (code === "unknown_protocol") {
    return { message: "That assessment is not one offered for this patient's condition type.", fix: "Start the one offered.", kind: "refused" };
  }
  if (code === "appointment_mismatch") {
    return { message: "That reading belongs to the assessment's own session.", fix: "Reload the page and try again.", kind: "refused" };
  }
  if (failure.status === 503) {
    return { message: "We could not check that just now, so nothing was saved.", fix: "Try again in a moment.", kind: "unchecked" };
  }
  if (failure.status === 429) {
    return { message: "That was a lot of attempts in a short time.", fix: "Wait a moment, then try again.", kind: "wait" };
  }
  return { message: progressErrorMessage(failure, "measurement"), fix: null, kind: "refused" };
}

export const OFFLINE_FAILURE: CockpitFailure = { message: NETWORK_ERROR_MESSAGE, fix: null, kind: "offline" };

export function failureText(f: CockpitFailure): string {
  return f.fix ? `${f.message} ${f.fix}` : f.message;
}

// --- Skip and stop reasons ----------------------------------------------------------------------------

export const SKIP_OPTIONS = Object.entries(SKIP_REASONS).map(([key, label]) => ({ key, label }));
export const STOP_OPTIONS = Object.entries(STOP_REASONS).map(([key, label]) => ({ key, label }));

/** The step the person is on, or the first step if the id is stale. */
export function currentStep(protocol: SessionProtocol, stepId: string): ProtocolStep {
  return protocolStep(protocol, stepId) ?? protocol.steps[0];
}

// --- The heart and lung resting check --------------------------------------------------------------

export type PreExerciseStatus = "stop" | "clear" | "incomplete";

/** The newest pre-exercise check the server wrote into the run, or null when
 *  none has been (the resting step is not saved yet). Read from the events,
 *  never worked out here: the server is the one that checks. */
export function preExerciseFromEvents(events: readonly RunEvent[]): PreExerciseStatus | null {
  let status: PreExerciseStatus | null = null;
  for (const e of orderRunEvents(events)) {
    if (e.kind !== "safety_confirmed" || e.details.gate !== "cardio_pre_exercise") continue;
    const s = e.details.status;
    if (s === "stop" || s === "clear" || s === "incomplete") status = s;
  }
  return status;
}

/** Why an exertion step on the heart and lung protocol cannot be saved yet
 *  (the server refuses it too); null when nothing stands in the way. */
export function exertionBlock(protocol: SessionProtocol, step: ProtocolStep, check: PreExerciseStatus | null): string | null {
  if (!needsPreExerciseCheck(protocol, step)) return null;
  if (check === "clear") return null;
  if (check === "stop") return "The resting check says not to exercise today. Skip this step and contact the patient's doctor.";
  return "Save the resting check before any exercise.";
}
