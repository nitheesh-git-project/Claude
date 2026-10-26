import { NextRequest, NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { protocolStep, stepRecordsMeasure } from "@/lib/sessionProtocols";
import {
  RUN_EVENT_KINDS,
  checkStepAction,
  isUuid,
  preExerciseDetails,
  validateLayerSavedDetails,
  validateRedFlagDetails,
  validateSetupDetails,
  validateSkipDetails,
  validateStopDetails,
  type RunEventKind,
  type StepAction,
} from "@/lib/assessmentRun";
import {
  couldNotCheck,
  databaseNotReady,
  insertRunEvent,
  preExerciseFor,
  refusalResponse,
  requireOpenRun,
  runPreExerciseCheck,
} from "@/lib/assessmentRunServer";
import { serverError } from "@/lib/apiError";

// One step event in a guided video assessment (phase 7a). The cockpit sends
// what the physiotherapist did; the server re-derives the step from the
// run's protocol and refuses what the clinical order does not allow
// (assessmentRun.ts checkStepAction): nothing after step 1 until the red
// flags are answered, no test once one is answered yes, the whole set-up
// ticked before a save, the heart and lung pre-exercise check clear before
// any exertion -- worked out here from the resting vitals saved in THIS run,
// never from the request.
//
// Kinds:
//   step_opened      {}                                   the tab the therapist is on
//   setup_confirmed  { items: string[] }                  every set-up item id, ticked
//   safety_confirmed { answers: { [questionId]: boolean } } on the red-flag step;
//                    {} on the heart and lung resting step: the server runs the
//                    pre-exercise check and records its result
//   saved            { recordId } on a layer step (Pain Map, neurological or
//                    paediatric exam: the record that route wrote); measurementId
//                    on a measurement step (normally written by the measurement
//                    route itself -- this is the retry); nothing on the red-flag
//                    and summary steps
//   skipped          { reason?: SkipReason }              a skippable step only
//   stopped          { reason?: StopReason }              Stop test: the reading is
//                    thrown away; writes this event and nothing else
//
// Request:  { runId: string, stepId: string, kind: RunEventKind, details?: object,
//             measurementId?: string }
// Response: 200 { success: true, event: RunEvent, flagged?: string[],
//                 preExercise?: { status, flags: string[], notChecked: string[] },
//                 duplicate?: true }
//           400 malformed, 403 not your run or patient, 404 no such run,
//           409 { code } -- red_flags_unanswered, red_flag_present, setup_incomplete,
//               setup_not_confirmed, helper_not_confirmed, cardio_check_not_recorded,
//               cardio_red_flag, not_skippable, measure_not_in_step,
//               run_not_in_progress, protocol_changed, session_not_started,
//           429 rate limited, 503 a check that could not be run.
const ACTION_FOR: Record<RunEventKind, StepAction> = {
  step_opened: "open",
  setup_confirmed: "setup",
  safety_confirmed: "safety",
  saved: "save",
  skipped: "skip",
  stopped: "stop",
};

const LAYER_TABLE = {
  pain_map: "pain_assessments",
  neuro_exam: "neuro_assessments",
  peds_exam: "peds_assessments",
} as const;

export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{
    runId?: unknown;
    stepId?: unknown;
    kind?: unknown;
    details?: unknown;
    measurementId?: unknown;
  }>(request);
  if (parseError) return parseError;
  if (typeof body.kind !== "string" || !(RUN_EVENT_KINDS as readonly string[]).includes(body.kind)) {
    return NextResponse.json({ error: "Unknown event kind.", code: "bad_request" }, { status: 400 });
  }
  const kind = body.kind as RunEventKind;
  if (body.details !== undefined && (typeof body.details !== "object" || body.details === null || Array.isArray(body.details))) {
    return NextResponse.json({ error: "details must be an object.", code: "bad_request" }, { status: 400 });
  }
  if (body.measurementId !== undefined && body.measurementId !== null && !isUuid(body.measurementId)) {
    return NextResponse.json({ error: "measurementId must be a measurement id.", code: "bad_request" }, { status: 400 });
  }

  const opened = await requireOpenRun(request, body.runId);
  if (!opened.ok) return opened.response;
  const { gate } = opened;
  const limited = await enforceRateLimit(request, "assessmentRun", { identifier: gate.therapistId });
  if (limited) return limited;

  const step = typeof body.stepId === "string" ? protocolStep(gate.protocol, body.stepId) : null;
  if (!step) return NextResponse.json({ error: "That step is not part of this assessment.", code: "unknown_step" }, { status: 400 });

  // Worked out only where it can refuse: a set-up or a save on an exertion
  // step. A skip or a stop must never wait on it.
  let preExercise = null;
  if (kind === "setup_confirmed" || kind === "saved") {
    const pre = await preExerciseFor(gate.admin, gate, step);
    if (!pre.ok) return pre.response;
    preExercise = pre.check;
  }
  const refused = checkStepAction({ protocol: gate.protocol, step, state: gate.state, action: ACTION_FOR[kind], preExercise });
  if (refused) return refusalResponse(refused);

  let details: Record<string, unknown> = {};
  let measurementId: string | null = null;
  const extra: Record<string, unknown> = {};

  switch (kind) {
    case "step_opened":
      break;
    case "setup_confirmed": {
      const v = validateSetupDetails(step, body.details);
      if (!v.ok) return refusalResponse(v.refusal);
      details = v.details;
      break;
    }
    case "safety_confirmed": {
      if (step.tool === "red_flags") {
        const v = validateRedFlagDetails(step, body.details);
        if (!v.ok) return refusalResponse(v.refusal);
        details = v.details;
        extra.flagged = v.details.flagged;
      } else if (step.id === gate.protocol.preExerciseVitalsStepId) {
        const computed = await runPreExerciseCheck(gate.admin, gate.run, gate.protocol, gate.state, gate.events);
        if (!computed.ok) return couldNotCheck();
        details = preExerciseDetails(computed.check);
        extra.preExercise = {
          status: computed.check.status,
          flags: computed.check.flags.map((f) => f.clinicianText),
          notChecked: computed.check.notChecked,
          refusal: computed.check.refusal?.clinician ?? null,
        };
      } else {
        return NextResponse.json({ error: "This step has no safety check to confirm.", code: "bad_request" }, { status: 400 });
      }
      break;
    }
    case "saved": {
      if (step.layer) {
        const v = validateLayerSavedDetails(step, body.details);
        if (!v.ok) return refusalResponse(v.refusal);
        // The record must be this patient's, written by this therapist since
        // the run started -- not an older exam claimed for today.
        const { data: record, error } = await gate.admin
          .from(LAYER_TABLE[step.layer])
          .select("id, patient_id, submitted_by, created_at")
          .eq("id", v.details.recordId)
          .maybeSingle();
        if (error) return couldNotCheck();
        if (
          !record ||
          record.patient_id !== gate.run.patientId ||
          record.submitted_by !== gate.therapistId ||
          Date.parse(record.created_at as string) < Date.parse(gate.run.startedAt)
        ) {
          return NextResponse.json({ error: "That record is not one you saved in this assessment.", code: "bad_request" }, { status: 400 });
        }
        details = v.details;
      } else if (step.measures.length > 0) {
        if (typeof body.measurementId !== "string") {
          return NextResponse.json(
            { error: "Save the reading through Record a test; it links itself to this step.", code: "bad_request" },
            { status: 400 }
          );
        }
        const { data: m, error } = await gate.admin
          .from("outcome_measurements")
          .select("id, patient_id, recorded_by, measure_key, variant, created_at")
          .eq("id", body.measurementId)
          .maybeSingle();
        if (error) return couldNotCheck();
        if (
          !m ||
          m.patient_id !== gate.run.patientId ||
          m.recorded_by !== gate.therapistId ||
          Date.parse(m.created_at as string) < Date.parse(gate.run.startedAt) ||
          !stepRecordsMeasure(step, m.measure_key as string, (m.variant as string | null) ?? null)
        ) {
          return NextResponse.json({ error: "That reading is not one you saved for this step.", code: "measure_not_in_step" }, { status: 409 });
        }
        measurementId = m.id as string;
      }
      break;
    }
    case "skipped": {
      const v = validateSkipDetails(step, body.details);
      if (!v.ok) return refusalResponse(v.refusal);
      details = v.details;
      break;
    }
    case "stopped": {
      const v = validateStopDetails(body.details);
      if (!v.ok) return refusalResponse(v.refusal);
      details = v.details;
      break;
    }
  }

  const written = await insertRunEvent(gate.admin, {
    runId: gate.run.id,
    stepId: step.id,
    kind,
    details,
    measurementId,
    actor: gate.therapistId,
  });
  if (!written.ok) {
    if (written.code === "duplicate") return NextResponse.json({ success: true, duplicate: true });
    if (written.code === "run_not_in_progress") {
      return NextResponse.json({ error: "This assessment has already ended.", code: "run_not_in_progress" }, { status: 409 });
    }
    if (written.code === "not_migrated") return databaseNotReady();
    return serverError("therapist/assessment-runs/event", new Error("event insert failed"));
  }
  return NextResponse.json({ success: true, event: written.event, ...extra });
}
