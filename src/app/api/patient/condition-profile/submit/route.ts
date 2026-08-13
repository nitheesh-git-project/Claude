import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActiveAndApproved } from "@/lib/supabase/requireActiveProfile";
import { INTAKE_QUESTIONS, findMissingRequiredKeys, mergeIntakeQuestionOverrides } from "@/lib/conditionIntake";

const ALLOWED_KEYS = new Set(INTAKE_QUESTIONS.map((q) => q.key));

// Patient submits (or edits) their own Patient Care Intake. Every
// submission — first fill or a later edit — queues in
// condition_change_requests and only becomes the live profile once an
// admin approves it (see the schema.sql section comment for why). The
// patient's existing approved data stays visible on their dashboard the
// whole time this is pending.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{ data?: unknown }>(request);
  if (parseError) return parseError;

  const answers = body.data;
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

  // Re-check required fields server-side against the current admin
  // question bank -- never trust the client-side check alone, same
  // posture as every other route.
  const { data: intakeOverrideRows } = await admin
    .from("intake_question_templates")
    .select("question_key, question_text, required");
  const questions = mergeIntakeQuestionOverrides(INTAKE_QUESTIONS, intakeOverrideRows ?? []);
  const missingKeys = findMissingRequiredKeys(questions, answers as Record<string, string>);
  if (missingKeys.length > 0) {
    return NextResponse.json(
      { error: "Please fill in all required fields before submitting." },
      { status: 400 }
    );
  }

  // One pending submission per patient at a time — a second submitter
  // (from either role) waits until the first is reviewed, so admin never
  // reviews two conflicting proposals for the same patient.
  const { count: pendingCount } = await admin
    .from("condition_change_requests")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", user.id)
    .eq("status", "pending");
  if (pendingCount && pendingCount > 0) {
    return NextResponse.json(
      { error: "A submission for your health profile is already awaiting admin review." },
      { status: 409 }
    );
  }

  const { error: insertError } = await admin.from("condition_change_requests").insert({
    patient_id: user.id,
    submitted_by: user.id,
    submitted_by_role: "patient",
    proposed_data: answers,
    status: "pending",
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { error: upsertError } = await admin
    .from("patient_condition_profiles")
    .upsert(
      { patient_id: user.id, status: "pending_review", draft_data: null },
      { onConflict: "patient_id" }
    );
  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
