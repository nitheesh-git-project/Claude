import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { loadConditionProfileCore } from "@/lib/conditionProfileServer";
import { NEURO_EXAM_VERSION, validateNeuroFindings } from "@/lib/neuroExam";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverError } from "@/lib/apiError";

// An admin records a neurological examination on a patient's behalf -- the
// counterpart of /api/admin/pain-assessments/submit, under the same scope
// ("people", the patient record) and the same posture: no access-grant
// gate, append-only, a new row rather than an edit. Validated by the same
// module the therapist's route uses, so neither door can store a value the
// other would refuse.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    patientId?: unknown;
    findings?: unknown;
  }>(request);
  if (parseError) return parseError;
  const patientId = typeof body.patientId === "string" ? body.patientId.trim() : "";
  if (!patientId) {
    return NextResponse.json({ error: "Missing patientId" }, { status: 400 });
  }
  const validated = validateNeuroFindings(body.findings);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: patient, error: patientError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", patientId)
    .eq("role", "patient")
    .maybeSingle();
  // "We couldn't check" is not "no such patient".
  if (patientError) {
    return NextResponse.json({ error: "We couldn't check this patient just now. Please try again." }, { status: 503 });
  }
  if (!patient) {
    return NextResponse.json({ error: "No such patient." }, { status: 404 });
  }

  const conditionProfile = await loadConditionProfileCore(admin, patientId);
  if (conditionProfile.specialty !== "neuro") {
    return NextResponse.json(
      {
        error:
          "The neurological examination applies to neurological profiles. This patient is recorded under a different condition type.",
      },
      { status: 400 }
    );
  }

  const { error: insertError } = await admin.from("neuro_assessments").insert({
    patient_id: patientId,
    submitted_by: adminUser.id,
    submitted_by_role: "admin",
    schema_version: NEURO_EXAM_VERSION,
    findings: validated.findings,
  });
  if (insertError) {
    return serverError("admin/neuro-assessments/submit", insertError);
  }

  // Best-effort and after the write, per the audit-log rule.
  await recordAdminActivity(admin, adminUser.id, {
    action: "neuro_assessment.create",
    targetId: patientId,
  });

  return NextResponse.json({ success: true });
}
