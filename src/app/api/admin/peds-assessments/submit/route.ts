import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { insertPedsExam, preparePedsExam } from "@/lib/pedsExamRoute";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverNowMs } from "@/lib/debugClock";

// An admin records a paediatric examination on a patient's behalf -- the
// counterpart of /api/admin/neuro-assessments/submit, under the same scope
// ("people", the patient record) and the same posture: no access-grant
// gate, append-only, a new row rather than an edit. Validated by the same
// module the therapist's route uses (pedsExamRoute.ts -> validatePedsFindings),
// so neither door can store a value the other would refuse.
//
// Request (POST, JSON): { patientId: string, findings: PedsFindings } -- the
// therapist route's contract. Answers: 200 { success: true } | 400 (invalid
// findings, or `not_paediatric`) | 403 (scope) | 404 (no such patient) | 503.
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

  const admin = createAdminClient();
  const { data: patient, error: patientError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", patientId)
    .eq("role", "patient")
    .maybeSingle();
  // "We couldn't check" is not "no such patient": a malformed id (22P02) is
  // the latter, as on /api/admin/measurements/submit.
  if (patientError && patientError.code !== "22P02") {
    return NextResponse.json({ error: "We couldn't check this patient just now. Please try again." }, { status: 503 });
  }
  if (!patient) {
    return NextResponse.json({ error: "No such patient." }, { status: 404 });
  }

  const prepared = await preparePedsExam(admin, patientId, body.findings, serverNowMs(request));
  if (!prepared.ok) return prepared.response;

  const failed = await insertPedsExam(
    admin,
    { patientId, submittedBy: adminUser.id, submittedByRole: "admin", findings: prepared.findings },
    "admin/peds-assessments/submit"
  );
  if (failed) return failed;

  // Best-effort and after the write, per the audit-log rule.
  await recordAdminActivity(admin, adminUser.id, {
    action: "peds_assessment.create",
    targetId: patientId,
  });

  return NextResponse.json({ success: true });
}
