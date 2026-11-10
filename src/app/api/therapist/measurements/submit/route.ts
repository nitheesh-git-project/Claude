import { NextRequest, NextResponse } from "next/server";
import { recordUserActivity } from "@/lib/userActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { guardCommunication } from "@/lib/communicationFlags";
import { serverNowMs } from "@/lib/debugClock";
import { requireAssignedTherapist, requireSignedInUser, requireStartedSession } from "@/lib/therapistClinicalGate";
import { checkLinkedAppointment, insertMeasurement, prepareMeasurement } from "@/lib/outcomeMeasurementRoute";
import { checkMeasurementInRun, insertRunEvent } from "@/lib/assessmentRunServer";

// A therapist records one standardised test -- walking speed, Timed Up and
// Go, LEFS, the six-minute walk... -- in the shared measurement layer
// (outcome_measurements, src/lib/outcomeMeasures.ts).
//
// Gated exactly like the neurological exam (/api/therapist/neuro-assessments/
// submit): assigned to the patient AND a session with them that has started
// or been delivered (on the debug bar's clock), no access grant, live at
// once. Mirrors outcome_measurements_insert_assigned_therapist as defence in
// depth, since this route writes with the service role -- including its
// second half: a linked session must be this therapist's own with this
// patient.
//
// Validated by validateMeasurement() against the patient's profile kind,
// re-derived here from the recorded condition type and intake answers
// (profileKindFor), never sent by the client: a measure another layer owns
// (pain on the Pain Map; an ordinary neurological patient's TUG and 10-metre
// walk on the neurological exam) is refused, a licensed scale the clinic has
// not switched on is refused, and a Parkinson's TUG or walk needs ON/OFF,
// the last dose and all three trials. Append-only: a re-test is a new row.
//
// Inside a guided video assessment (phase 7a) the screen also sends `runId`
// and `stepId`. The step is then re-derived from the run's protocol and the
// save is refused (409 with a code) unless the step's set-up was confirmed
// in this run, a helper was confirmed where the step needs one (and the
// reading says so), the red flags were answered with none present, the
// measure is one the step records, the reading was taken over video, a vital
// sign is marked as read off the patient's own device, and -- on the heart
// and lung protocol -- the pre-exercise check worked out from this run's own
// resting vitals is clear before any exertion measure (the six-minute walk,
// the sit-to-stand tests, the walks). The run must be this therapist's, this
// patient's and in progress. The measurement then writes the run's "saved"
// event itself; if that one write fails the reading stands (it is
// append-only) and `runEvent.recorded` is false, for the cockpit to retry
// through /api/therapist/assessment-runs/event. Without `runId` nothing
// changes from before.
//
// Request:  { patientId: string, appointmentId?: string | null,
//             measurement: MeasurementInput,   (see outcomeMeasures.ts)
//             runId?: string, stepId?: string }
// Response: 200 { success: true, measurement: MeasurementPoint,
//                 runEvent?: { recorded: boolean, eventId: string | null } }
//           400 validation, 403 not this therapist's patient / session / run,
//           404 no such run,
//           409 { code: "session_not_started" | "no_condition_profile"
//                 | an assessment-run code (assessmentRun.ts RunRefusalCode) },
//           503 a check that could not be run.
export async function POST(request: NextRequest) {
  const who = await requireSignedInUser();
  if (!who.ok) return who.response;

  const { data: body, error: parseError } = await parseJsonBody<{
    patientId?: unknown;
    appointmentId?: unknown;
    measurement?: unknown;
    runId?: unknown;
    stepId?: unknown;
  }>(request);
  if (parseError) return parseError;
  const patientId = typeof body.patientId === "string" ? body.patientId.trim() : "";
  if (!patientId) {
    return NextResponse.json({ error: "Missing patientId" }, { status: 400 });
  }

  const gate = await requireAssignedTherapist(
    who.userId,
    patientId,
    "You can only record measurements for a patient you've been assigned to."
  );
  if (!gate.ok) return gate.response;
  const { admin, therapistId } = gate;
  const nowMs = serverNowMs(request);

  const prepared = await prepareMeasurement(admin, patientId, body.measurement, nowMs);
  if (!prepared.ok) return prepared.response;

  const notStarted = await requireStartedSession(
    admin,
    therapistId,
    patientId,
    nowMs,
    "Measurements are recorded from a session you've started with this patient. Open this once your session with them begins."
  );
  if (notStarted) return notStarted;

  const inRun = body.runId !== undefined && body.runId !== null;
  let run: { id: string; appointmentId: string | null; stepId: string } | null = null;
  if (inRun || (body.stepId !== undefined && body.stepId !== null)) {
    const m = prepared.measurement;
    const checked = await checkMeasurementInRun(admin, {
      therapistId,
      patientId,
      runId: body.runId,
      stepId: body.stepId,
      measurement: { measureKey: m.measureKey, variant: m.variant, conditions: m.conditions },
    });
    if (!checked.ok) return checked.response;
    run = { id: checked.run.id, appointmentId: checked.run.appointmentId, stepId: checked.step.id };
  }

  // A reading in a run is filed against the run's session unless the screen
  // names one, and never against a different one.
  const appointmentRaw = body.appointmentId ?? run?.appointmentId ?? null;
  if (run?.appointmentId && body.appointmentId && body.appointmentId !== run.appointmentId) {
    return NextResponse.json(
      { error: "This reading belongs to the assessment's own session.", code: "appointment_mismatch" },
      { status: 409 }
    );
  }
  const linked = await checkLinkedAppointment(admin, appointmentRaw, patientId, therapistId);
  if (!linked.ok) return linked.response;

  // The patient reads these beside the number (their Health Profile), so
  // the free text is scanned at write time like a neurological exam note.
  const { conditions } = prepared.measurement;
  const subjects = [conditions.walkingAid, conditions.footwear, conditions.testerName]
    .filter((text): text is string => typeof text === "string" && text.length > 0)
    .map((text) => ({ surface: "outcome_measurement_condition" as const, text }));
  if (subjects.length > 0) {
    const leak = await guardCommunication(admin, subjects, { authorId: therapistId, authorRole: "therapist", patientId });
    if (leak.blockedMessage) {
      return NextResponse.json({ error: leak.blockedMessage }, { status: 400 });
    }
  }

  const inserted = await insertMeasurement(admin, "therapist/measurements/submit", {
    patientId,
    appointmentId: linked.appointmentId,
    measurement: prepared.measurement,
    recordedBy: therapistId,
    recordedByRole: "therapist",
  });
  if (!inserted.ok) return inserted.response;

  await recordUserActivity(admin, {
    action: "outcome_measurement.recorded",
    actor: { id: therapistId, role: "therapist" },
    patientId,
    therapistId,
    appointmentId: linked.appointmentId,
    details: { measureKey: prepared.measurement.measureKey },
  });

  if (run) {
    const event = await insertRunEvent(admin, {
      runId: run.id,
      stepId: run.stepId,
      kind: "saved",
      details: {},
      measurementId: inserted.point.id,
      actor: therapistId,
    });
    return NextResponse.json({
      success: true,
      measurement: inserted.point,
      runEvent: { recorded: event.ok, eventId: event.ok ? event.event.id : null },
    });
  }

  return NextResponse.json({ success: true, measurement: inserted.point });
}
