import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActiveAndApproved } from "@/lib/supabase/requireActiveProfile";
import { hasApprovedConditionAccess } from "@/lib/conditionAccess";
import { INTAKE_QUESTIONS } from "@/lib/conditionIntake";

const ALLOWED_KEYS = new Set(INTAKE_QUESTIONS.map((q) => q.key));

// Therapist submits a Patient Care Intake on a patient's behalf, after the
// patient's admin has approved their access grant. Goes through the same
// admin-review queue as a patient's own submission (Flow B) — the grant
// only gates who may propose a change, not whether it needs review.
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
  const invalidKeys = Object.keys(answers).filter((k) => !ALLOWED_KEYS.has(k));
  if (invalidKeys.length > 0) {
    return NextResponse.json({ error: "Submission contains unknown fields." }, { status: 400 });
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
  if (!(await hasApprovedConditionAccess(admin, user.id, patientId))) {
    return NextResponse.json(
      { error: "You don't have an approved access grant for this patient's health profile." },
      { status: 403 }
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
    status: "pending",
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { error: upsertError } = await admin
    .from("patient_condition_profiles")
    .upsert({ patient_id: patientId, status: "pending_review" }, { onConflict: "patient_id" });
  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
