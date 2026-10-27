import { NextRequest, NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { sessionProtocol, teachExercisesStep } from "@/lib/sessionProtocols";
import { exerciseByKey } from "@/lib/exerciseLibrary";
import { buildExerciseDisplay, parseLiveDisplayRow } from "@/lib/assessmentRun";
import { checkTeachExercise, checkTeachStep, teachAction, validateTeachRequest } from "@/lib/exercisePlan";
import { databaseNotReady, preExerciseFor, refusalResponse, requireOpenRun, writeLiveDisplay } from "@/lib/assessmentRunServer";
import {
  exerciseRefusalResponse,
  exercisesCouldNotCheck,
  exercisesNotMigrated,
  insertTeachingEvent,
  loadActiveExercisePlan,
  loadTeachingEvents,
} from "@/lib/exercisePlanServer";
import { serverError } from "@/lib/apiError";

// Teaching one home exercise on the guided video session's Home exercises
// step (phase 7d). Two kinds of request, never both:
//
//   { runId, exerciseKey, phase: "demo" | "go" }
//       shows the exercise on the patient's companion screen: "demo" (watch
//       how it is done) or "go" (your turn). The words and the picture are
//       the LIBRARY'S own -- the exercise's name, its demo picture and its
//       steps, and the fixed phase lines -- never text from the request
//       (buildExerciseDisplay; validateLiveDisplay and the table's CHECK
//       re-check them).
//   { runId, exerciseKey, outcome, cueKey?, reasonKey? }
//       records what the physiotherapist SAW on camera, one mark per
//       exercise per plan per run: performed_correctly, needs_practice with
//       one cue from COACHING_CUES, or not_attempted with one reason from
//       NOT_ATTEMPTED_REASONS (exercisePlan.ts). The patient's screen moves
//       to "done" for that exercise.
//
// Gates, all on the server: the run is this therapist's, in progress, with
// the assigned-therapist and started-session gate (requireOpenRun); the red
// flags answered (and none raised, for a demo or the patient's turn); for
// the patient's turn and a performed / needs-practice mark, the step's set-up
// ticked and, on the heart and lung protocol, the pre-exercise check clear;
// the exercise in the patient's ACTIVE plan; and an exercise that needs
// another adult beside the patient only once the step's set-up ticked that
// helper. Teaching happens only inside a run: there is no other door.
//
// Response: 200 { success: true, display?: LiveDisplayView, serverNow?: string,
//                 event?: TeachingEvent, duplicate?: true, displayWritten?: boolean }
//           400 malformed (text, an unknown exercise, a cue or reason not on its list),
//           403 / 404 as the event route,
//           409 { code } -- red_flags_unanswered, red_flag_present, setup_not_confirmed,
//               cardio_check_not_recorded, cardio_red_flag, no_active_plan, not_in_plan,
//               helper_not_confirmed, already_marked, changed_elsewhere, no_teach_step,
//               run_not_in_progress, protocol_changed, session_not_started,
//           429 rate limited, 503 a check that could not be run.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<Record<string, unknown>>(request);
  if (parseError) return parseError;
  const parsed = validateTeachRequest(body);
  if (!parsed.ok) return exerciseRefusalResponse(parsed.refusal);
  const req = parsed.request;

  const opened = await requireOpenRun(request, body.runId);
  if (!opened.ok) return opened.response;
  const { gate } = opened;
  const limited = await enforceRateLimit(request, req.kind === "display" ? "assessmentDisplay" : "assessmentRun", { identifier: gate.therapistId });
  if (limited) return limited;

  const step = teachExercisesStep(gate.protocol);
  if (!step) return NextResponse.json({ error: "This assessment has no Home exercises step.", code: "no_teach_step" }, { status: 409 });
  const exercise = exerciseByKey(req.exerciseKey)!;

  const action = teachAction(req);
  let preExercise = null;
  if (action === "doing") {
    const pre = await preExerciseFor(gate.admin, gate, step);
    if (!pre.ok) return pre.response;
    preExercise = pre.check;
  }
  const stepRefusal = checkTeachStep({ protocol: gate.protocol, step, state: gate.state, action, preExercise });
  if (stepRefusal) return refusalResponse(stepRefusal);

  const active = await loadActiveExercisePlan(gate.admin, gate.run.patientId);
  if (active.status === "not_migrated") return exercisesNotMigrated();
  if (active.status !== "ok") return exercisesCouldNotCheck();
  const plan = active.plan ? { id: active.plan.id, exerciseKeys: active.plan.items.map((i) => i.exerciseKey) } : null;
  const helperConfirmed = gate.state.helperConfirmed.has(step.id);
  const fit = checkTeachExercise({ plan, exercise, request: req, helperConfirmed });
  if (!fit.ok) return exerciseRefusalResponse(fit.refusal);

  const show = async (phase: "demo" | "go" | "done") => {
    const built = buildExerciseDisplay({ protocol: gate.protocol, step, exercise, phase, index: fit.index, total: fit.total });
    if (!built.ok) return null;
    const written = await writeLiveDisplay(gate.admin, gate.run, built.write);
    return written.ok ? parseLiveDisplayRow(written.row, sessionProtocol) : null;
  };

  if (req.kind === "display") {
    const view = await show(req.phase);
    if (!view) return serverError("therapist/assessment-runs/teach", new Error("exercise display write failed"));
    return NextResponse.json({ success: true, display: view, serverNow: new Date().toISOString() });
  }

  const written = await insertTeachingEvent(gate.admin, {
    runId: gate.run.id,
    planId: plan!.id,
    patientId: gate.run.patientId,
    exerciseKey: exercise.key,
    outcome: req.outcome,
    cueKey: req.cueKey,
    reasonKey: req.reasonKey,
    helperPresent: helperConfirmed,
    actor: gate.therapistId,
  });
  if (!written.ok) {
    if (written.code === "duplicate") {
      // A retry of the same mark is a success; a different mark is refused
      // -- what was watched is not changed afterwards.
      const prior = await loadTeachingEvents(gate.admin, gate.run.id);
      if (prior.status !== "ok") return exercisesCouldNotCheck();
      const same = prior.events.find((e) => e.planId === plan!.id && e.exerciseKey === exercise.key);
      if (same && same.outcome === req.outcome && same.cueKey === req.cueKey && same.reasonKey === req.reasonKey) {
        return NextResponse.json({ success: true, event: same, duplicate: true });
      }
      return NextResponse.json({ error: `${exercise.name} is already marked for this session.`, code: "already_marked" }, { status: 409 });
    }
    if (written.code === "changed_elsewhere") {
      return NextResponse.json(
        { error: "The assessment ended or the plan changed while you were saving. Reload and try again.", code: "changed_elsewhere" },
        { status: 409 }
      );
    }
    if (written.code === "not_migrated") return databaseNotReady();
    return serverError("therapist/assessment-runs/teach", new Error("teaching event insert failed"));
  }

  // Costs the patient's "done" screen if it fails, never the mark.
  const view = await show("done");
  return NextResponse.json({ success: true, event: written.event, displayWritten: !!view });
}
