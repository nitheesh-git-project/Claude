import { NextRequest, NextResponse } from "next/server";
import { recordUserActivity } from "@/lib/userActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { guardCommunication } from "@/lib/communicationFlags";
import { serverNowMs } from "@/lib/debugClock";
import { requireAssignedTherapist, requireSignedInUser, requireStartedSession } from "@/lib/therapistClinicalGate";
import { checkLinkedAppointment, insertMeasurement, prepareMeasurement } from "@/lib/outcomeMeasurementRoute";

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
// Request:  { patientId: string, appointmentId?: string | null,
//             measurement: MeasurementInput }   (see outcomeMeasures.ts)
// Response: 200 { success: true, measurement: MeasurementPoint }
//           400 validation, 403 not this therapist's patient / session,
//           409 { code: "session_not_started" | "no_condition_profile" },
//           503 a check that could not be run.
export async function POST(request: NextRequest) {
  const who = await requireSignedInUser();
  if (!who.ok) return who.response;

  const { data: body, error: parseError } = await parseJsonBody<{
    patientId?: unknown;
    appointmentId?: unknown;
    measurement?: unknown;
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

  const linked = await checkLinkedAppointment(admin, body.appointmentId, patientId, therapistId);
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

  return NextResponse.json({ success: true, measurement: inserted.point });
}
