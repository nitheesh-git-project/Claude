import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActiveAndApproved } from "@/lib/supabase/requireActiveProfile";
import { hasApprovedConditionAccess } from "@/lib/conditionAccess";
import { findMissingRequiredKeys, questionKeysForSpecialty } from "@/lib/conditionIntake";
import { loadConditionProfileCore, loadMergedIntakeQuestions } from "@/lib/conditionProfileServer";

// Therapist EDITS an existing Patient Care Intake on a patient's behalf,
// after the patient's admin has approved their access grant. Goes through
// the same admin-review queue as a patient's own submission — the grant
// only gates who may propose a change, not whether it needs review.
//
// Note what this route is not: creating the record in the first place is
// /api/therapist/condition-profile/onboard, which needs only assignment
// and writes live. The split is the create-vs-edit line -- the first fill
// is the therapist's own clinical record of a session they ran, the same
// kind of thing a Pain Map exam or a session note is, while this is
// editing the patient's own account of their history and keeps needing a
// human to approve it. The specialty cannot be changed through here
// either; re-triage is a clinical decision and goes through onboard.
export async function POST(request: NextRequest) {
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await isProfileActiveAndApproved(user.id))) {
    return NextResponse.json(
      { error: "Your account is not active — it is either awaiting admin approval or has been suspended." },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "therapist") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!(await hasApprovedConditionAccess(admin, user.id, patientId))) {
    return NextResponse.json(
      { error: "You don't have an approved access grant for this patient's health profile." },
      { status: 403 }
    );
  }

  const patientProfile = await loadConditionProfileCore(admin, patientId);
  const allowedKeys = new Set(questionKeysForSpecialty(patientProfile.specialty));
  const invalidKeys = Object.keys(answers).filter((k) => !allowedKeys.has(k));
  if (invalidKeys.length > 0) {
    return NextResponse.json({ error: "Submission contains unknown fields." }, { status: 400 });
  }

  // Re-check required fields server-side against the current admin
  // question bank -- never trust the client-side check alone.
  const questions = await loadMergedIntakeQuestions(admin, patientProfile.specialty);
  const missingKeys = findMissingRequiredKeys(questions, answers as Record<string, string>);
  if (missingKeys.length > 0) {
    return NextResponse.json(
      { error: "Please fill in all required fields before submitting." },
      { status: 400 }
    );
  }

  const { count: pendingCount } = await admin
    .from("condition_change_requests")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", patientId)
    .eq("status", "pending");
  if (pendingCount && pendingCount > 0) {
    return NextResponse.json(
      { error: "A submission for this patient's health profile is already awaiting admin review." },
      { status: 409 }
    );
  }

  const { error: insertError } = await admin.from("condition_change_requests").insert({
    patient_id: patientId,
    submitted_by: user.id,
    submitted_by_role: "therapist",
    proposed_data: answers,
    proposed_specialty: patientProfile.specialty,
    status: "pending",
  });
  if (insertError) {
    // See the matching comment in patient/condition-profile/submit --
    // condition_change_requests_one_pending (schema.sql) is the real
    // guard against a patient/therapist submission race; the count check
    // above is just the fast path.
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "A submission for this patient's health profile is already awaiting admin review." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { error: upsertError } = await admin
    .from("patient_condition_profiles")
    .upsert(
      { patient_id: patientId, status: "pending_review", draft_data: null },
      { onConflict: "patient_id" }
    );
  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
