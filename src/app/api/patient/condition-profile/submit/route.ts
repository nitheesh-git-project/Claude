import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActiveAndApproved } from "@/lib/supabase/requireActiveProfile";
import { findMissingRequiredKeys, patientIntakeGate, questionKeysForSpecialty } from "@/lib/conditionIntake";
import { loadConditionProfileCore, loadMergedIntakeQuestions } from "@/lib/conditionProfileServer";

// Patient edits their own Patient Care Intake. Every submission queues in
// condition_change_requests and only becomes the live profile once an
// admin approves it (see the schema.sql section comment for why). The
// patient's existing approved data stays visible on their dashboard the
// whole time this is pending.
//
// The patient no longer opens the record: a therapist fills it in at the
// first session and that fill is what unlocks this route
// (patientIntakeGate). Until then there is nothing here for the patient to
// edit -- and the check is real rather than cosmetic, because
// condition_change_requests_insert_gated carries the same condition, so a
// locked patient cannot POST to PostgREST around this route either.
//
// The specialty is NOT accepted from the body. Which question set a
// patient is answering is a clinical decision the therapist made at
// triage; the patient answers whichever set is on their profile.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{ data?: unknown }>(request);
  if (parseError) return parseError;

  const answers = body.data;
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

  const profile = await loadConditionProfileCore(admin, user.id);
  const gate = patientIntakeGate(profile);
  if (!gate.canEdit) {
    return NextResponse.json(
      {
        error:
          gate.reason === "awaiting_therapist"
            ? "Your therapist fills this in with you at your first session. You can add to it once they have."
            : "A submission for your health profile is already awaiting admin review.",
      },
      { status: gate.reason === "awaiting_therapist" ? 403 : 409 }
    );
  }

  // The allowlist is this patient's own specialty, not every key the app
  // knows: `data` is one flat blob shared by all three sets, so accepting
  // another specialty's keys would let a patient write into a record
  // nobody is going to read.
  const allowedKeys = new Set(questionKeysForSpecialty(profile.specialty));
  const invalidKeys = Object.keys(answers).filter((k) => !allowedKeys.has(k));
  if (invalidKeys.length > 0) {
    return NextResponse.json({ error: "Submission contains unknown fields." }, { status: 400 });
  }

  // Re-check required fields server-side against the current admin
  // question bank -- never trust the client-side check alone, same
  // posture as every other route.
  const questions = await loadMergedIntakeQuestions(admin, profile.specialty);
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
    proposed_specialty: profile.specialty,
    status: "pending",
  });
  if (insertError) {
    // The count check above is a fast, friendly-error path -- the real
    // guard is condition_change_requests_one_pending (schema.sql), which
    // closes the race where two submissions for this patient land at
    // once. A unique violation here means we lost that race, not a real
    // server error.
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "A submission for your health profile is already awaiting admin review." },
        { status: 409 }
      );
    }
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
