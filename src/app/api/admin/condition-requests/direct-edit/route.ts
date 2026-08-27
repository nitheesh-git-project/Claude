import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import {
  intakeVersionForSpecialty,
  mergeSpecialtyAnswers,
  questionKeysForSpecialty,
} from "@/lib/conditionIntake";
import { loadConditionProfileCore } from "@/lib/conditionProfileServer";

// Admin edits a patient's Patient Care Intake directly. No review queue:
// admin is the approver of everyone else's edits, so a self-review step
// here would be redundant.
//
// Answers are validated against, and merged into, the patient's OWN
// specialty set. There is deliberately no specialty selector on this
// form: which question set a patient belongs to is a clinical decision
// the therapist makes at triage, and a dropdown buried in an answers form
// is how it gets changed by accident.
export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    patientId?: string;
    data?: unknown;
  }>(request);
  if (parseError) return parseError;
  const { patientId, data: answers } = body;
  if (!patientId) {
    return NextResponse.json({ error: "Missing patientId" }, { status: 400 });
  }
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return NextResponse.json({ error: "Missing data" }, { status: 400 });
  }
  const admin = createAdminClient();
  const profile = await loadConditionProfileCore(admin, patientId);
  const specialtyKeys = questionKeysForSpecialty(profile.specialty);
  const allowedKeys = new Set(specialtyKeys);
  const invalidKeys = Object.keys(answers).filter((k) => !allowedKeys.has(k));
  if (invalidKeys.length > 0) {
    return NextResponse.json({ error: "Submission contains unknown fields." }, { status: 400 });
  }

  // A pending submission (patient's own or a therapist's on-behalf edit) is
  // sitting in the review queue for this patient -- overwriting `data` here
  // would be silently discarded the moment that submission is later
  // approved (decide/route.ts upserts `data` from the *original* proposal,
  // with no idea this direct edit ever happened). Resolve the pending item
  // first instead of racing it.
  const { count: pendingCount } = await admin
    .from("condition_change_requests")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", patientId)
    .eq("status", "pending");
  if (pendingCount && pendingCount > 0) {
    return NextResponse.json(
      { error: "This patient has a pending submission awaiting review -- approve or decline it before editing directly." },
      { status: 409 }
    );
  }

  const { error } = await admin.from("patient_condition_profiles").upsert(
    {
      patient_id: patientId,
      data: mergeSpecialtyAnswers(profile.data, answers as Record<string, string>, specialtyKeys),
      schema_version: intakeVersionForSpecialty(profile.specialty),
      status: "active",
      last_submitted_by: adminUser.id,
      last_submitted_role: "admin",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "patient_id" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Direct edits skip the review queue, but not the audit trail -- insert
  // an already-"approved" condition_change_requests row so this edit
  // still shows up in the same Review history list as every reviewed
  // submission, instead of silently overwriting `data` with no record of
  // what it was before or who changed it.
  await admin.from("condition_change_requests").insert({
    patient_id: patientId,
    submitted_by: adminUser.id,
    submitted_by_role: "admin",
    proposed_data: answers,
    proposed_specialty: profile.specialty,
    status: "approved",
    admin_notes: "Direct edit by admin.",
    reviewed_by: adminUser.id,
    reviewed_at: new Date().toISOString(),
  });

  return NextResponse.json({ success: true });
}
