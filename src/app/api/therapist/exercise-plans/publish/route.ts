import { NextRequest, NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverNowMs } from "@/lib/debugClock";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { recordUserActivity } from "@/lib/userActivityLog";
import { guardCommunication } from "@/lib/communicationFlags";
import { teachExercisesStep } from "@/lib/sessionProtocols";
import { doseText, validatePlanItems } from "@/lib/exercisePlan";
import { requireAssignedTherapist, requireSignedInUser, requireStartedSession } from "@/lib/therapistClinicalGate";
import { requireOpenRun } from "@/lib/assessmentRunServer";
import {
  exerciseRefusalResponse,
  exercisesCouldNotCheck,
  exercisesNotMigrated,
  loadPatientExerciseContext,
  publishExercisePlan,
} from "@/lib/exercisePlanServer";
import { serverError } from "@/lib/apiError";
import type { createAdminClient } from "@/lib/supabase/admin";

// A physiotherapist publishes a patient's HOME EXERCISES (phase 7d,
// docs/rules/clinical.md "Home exercises"): a new version that replaces the
// active one, in one transaction (publish_exercise_plan). Not a care plan --
// that is the programme recommendation, with its own routes.
//
// Normally inside the guided video session (`runId`): the run must be this
// therapist's and in progress, and the patient is the run's -- never the
// body's. Outside a run (`patientId`, e.g. from the chart straight after a
// session) the caller must be an active therapist assigned to the patient
// with a session that has started or been delivered, on the debug clock.
// Either way the server re-derives the patient's profile kind and what the
// intake rules out, and refuses:
//   - a key that is not in the library, or not offered for the profile kind;
//   - an exercise the intake rules out (contraindicated);
//   - an exercise that needs another adult beside the patient outside a run
//     (helper_needs_run), or inside one whose Home exercises step's set-up did
//     not tick the helper (helper_not_confirmed);
//   - a dose outside its kind's bounds, a note longer than two short
//     sentences, a milestone that is not this patient's.
// The dose note is the physiotherapist's own words to the patient, so it is
// contact-scanned (surface exercise_plan_note). Admin has no door here.
//
// Request:  { runId?: string, patientId?: string,
//             items: { exerciseKey: string, dose?: Partial<ExerciseDose>, milestoneId?: string }[] }
// Response: 200 { success: true, plan: { id, version }, items: { exerciseKey, dose: ExerciseDose, doseText }[] }
//           400 malformed / an unknown exercise / a bad dose / a blocked note,
//           403 not this therapist's patient or run, 404 no such run,
//           409 { code } -- exercise_not_for_profile, contraindicated,
//               helper_needs_run, helper_not_confirmed, run_not_in_progress,
//               session_not_started, no_condition_profile, changed_elsewhere,
//           429 rate limited, 503 a check that could not be run or a
//           database without the tables.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{ runId?: unknown; patientId?: unknown; items?: unknown }>(request);
  if (parseError) return parseError;
  const hasRun = body.runId !== undefined && body.runId !== null && body.runId !== "";
  if (!hasRun && (typeof body.patientId !== "string" || !body.patientId.trim())) {
    return NextResponse.json({ error: "Send the guided run (runId) or the patient (patientId).", code: "bad_request" }, { status: 400 });
  }

  let therapistId: string;
  let patientId: string;
  let admin: ReturnType<typeof createAdminClient>;
  let nowMs: number;
  let runId: string | null = null;
  let appointmentId: string | null = null;
  let helper: "no_run" | "not_confirmed" | "confirmed" = "no_run";

  if (hasRun) {
    const opened = await requireOpenRun(request, body.runId);
    if (!opened.ok) return opened.response;
    const { gate } = opened;
    if (typeof body.patientId === "string" && body.patientId.trim() && body.patientId.trim() !== gate.run.patientId) {
      return NextResponse.json({ error: "That assessment is for a different patient.", code: "run_patient_mismatch" }, { status: 409 });
    }
    therapistId = gate.therapistId;
    patientId = gate.run.patientId;
    admin = gate.admin;
    nowMs = gate.nowMs;
    runId = gate.run.id;
    appointmentId = gate.run.appointmentId;
    const step = teachExercisesStep(gate.protocol);
    helper = step && gate.state.helperConfirmed.has(step.id) ? "confirmed" : "not_confirmed";
  } else {
    const who = await requireSignedInUser();
    if (!who.ok) return who.response;
    patientId = (body.patientId as string).trim();
    const gate = await requireAssignedTherapist(who.userId, patientId, "You can only set home exercises for a patient you've been assigned to.");
    if (!gate.ok) return gate.response;
    therapistId = gate.therapistId;
    admin = gate.admin;
    nowMs = serverNowMs(request);
    const notStarted = await requireStartedSession(
      admin,
      therapistId,
      patientId,
      nowMs,
      "Home exercises are set in a session you've started with this patient."
    );
    if (notStarted) return notStarted;
  }

  const limited = await enforceRateLimit(request, "exercisePlan", { identifier: therapistId });
  if (limited) return limited;

  const context = await loadPatientExerciseContext(admin, patientId, nowMs);
  if (context.status === "unreadable") return exercisesCouldNotCheck();
  if (context.status === "no_profile") {
    return NextResponse.json(
      { error: "This patient's condition type has not been recorded yet. Record it on their Health Profile first.", code: "no_condition_profile" },
      { status: 409 }
    );
  }

  const checked = validatePlanItems(body.items, { profileKind: context.profileKind, contraFlags: context.contraFlags, helper });
  if (!checked.ok) return exerciseRefusalResponse(checked.refusal);
  const items = checked.items;

  // A milestone named is one of this patient's own (the items' guard says
  // so again at the storage layer).
  const milestoneIds = [...new Set(items.map((i) => i.milestoneId).filter((id): id is string => !!id))];
  if (milestoneIds.length > 0) {
    const { data: milestones, error } = await admin.from("care_milestones").select("id, patient_id").in("id", milestoneIds);
    if (error) return exercisesCouldNotCheck();
    const mine = new Set((milestones ?? []).filter((m) => m.patient_id === patientId).map((m) => m.id as string));
    if (milestoneIds.some((id) => !mine.has(id))) {
      return NextResponse.json({ error: "That milestone is not one of this patient's.", code: "milestone_not_found" }, { status: 400 });
    }
  }

  const notes = items.map((i) => i.dose.note).filter((n): n is string => !!n);
  if (notes.length > 0) {
    const leak = await guardCommunication(
      admin,
      notes.map((text) => ({ surface: "exercise_plan_note" as const, text })),
      { authorId: therapistId, authorRole: "therapist", patientId }
    );
    if (leak.blockedMessage) return NextResponse.json({ error: leak.blockedMessage, code: "note_blocked" }, { status: 400 });
  }

  const published = await publishExercisePlan(admin, {
    patientId,
    authoredBy: therapistId,
    runId,
    appointmentId,
    profileKind: context.profileKind,
    items,
  });
  if (!published.ok) {
    if (published.code === "not_migrated") return exercisesNotMigrated();
    if (published.code === "changed_elsewhere") {
      return NextResponse.json(
        { error: "The assessment ended or the plan changed while you were saving. Nothing was changed - reload and try again.", code: "changed_elsewhere" },
        { status: 409 }
      );
    }
    if (published.code === "refused_by_storage") {
      return NextResponse.json({ error: "Part of the plan could not be saved as written. Nothing was changed.", code: "bad_dose" }, { status: 400 });
    }
    return serverError("therapist/exercise-plans/publish", new Error(published.message ?? "publish failed"), {
      message: "Could not save the home exercises. Nothing the patient sees has changed - please try again.",
    });
  }

  await recordUserActivity(admin, {
    action: "exercise_plan.published",
    actor: { id: therapistId, role: "therapist" },
    patientId,
    therapistId,
    appointmentId,
    details: { planId: published.planId, version: published.version, runId, exercises: items.map((i) => i.exercise.key) },
  });

  return NextResponse.json({
    success: true,
    plan: { id: published.planId, version: published.version },
    items: items.map((i) => ({ exerciseKey: i.exercise.key, dose: i.dose, doseText: doseText(i.dose) })),
  });
}
