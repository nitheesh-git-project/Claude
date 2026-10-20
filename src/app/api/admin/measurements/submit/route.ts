import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverNowMs } from "@/lib/debugClock";
import { checkLinkedAppointment, insertMeasurement, prepareMeasurement } from "@/lib/outcomeMeasurementRoute";

// An admin records an outcome measurement on a patient's behalf -- the
// counterpart of /api/admin/neuro-assessments/submit, under the same scope
// ("people", the patient record) and the same posture: no session gate, no
// access grant, append-only, a re-test is a new row. Validated by the same
// helper the therapist's route uses (prepareMeasurement ->
// validateMeasurement, against the profile kind re-derived here), so
// neither door can store a value the other would refuse. A linked session
// must be this patient's; any therapist's, since the admin ran none.
//
// Request:  { patientId: string, appointmentId?: string | null,
//             measurement: MeasurementInput }
// Response: 200 { success: true, measurement: MeasurementPoint }
//           400 validation, 403 scope, 404 no such patient,
//           409 { code: "no_condition_profile" }, 503 a check not run.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  const admin = createAdminClient();
  const { data: patient, error: patientError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", patientId)
    .eq("role", "patient")
    .maybeSingle();
  // "We couldn't check" is not "no such patient".
  if (patientError && patientError.code !== "22P02") {
    return NextResponse.json({ error: "We couldn't check this patient just now. Please try again." }, { status: 503 });
  }
  if (!patient) {
    return NextResponse.json({ error: "No such patient." }, { status: 404 });
  }

  const prepared = await prepareMeasurement(admin, patientId, body.measurement, serverNowMs(request));
  if (!prepared.ok) return prepared.response;

  const linked = await checkLinkedAppointment(admin, body.appointmentId, patientId, null);
  if (!linked.ok) return linked.response;

  const inserted = await insertMeasurement(admin, "admin/measurements/submit", {
    patientId,
    appointmentId: linked.appointmentId,
    measurement: prepared.measurement,
    recordedBy: adminUser.id,
    recordedByRole: "admin",
  });
  if (!inserted.ok) return inserted.response;

  // Best-effort and after the write, per the audit-log rule.
  await recordAdminActivity(admin, adminUser.id, {
    action: "outcome_measurement.create",
    targetId: patientId,
    details: {
      measureKey: prepared.measurement.measureKey,
      measurementId: inserted.point.id,
      value: prepared.measurement.value,
    },
  });

  return NextResponse.json({ success: true, measurement: inserted.point });
}
