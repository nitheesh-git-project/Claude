import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActiveAndApproved } from "@/lib/supabase/requireActiveProfile";
import { isTherapistAssignedToPatient } from "@/lib/conditionAccess";
import {
  findMissingRequiredKeys,
  intakeVersionForSpecialty,
  mergeSpecialtyAnswers,
  questionKeysForSpecialty,
} from "@/lib/conditionIntake";
import {
  loadConditionProfileCore,
  loadMergedIntakeQuestions,
  readEnabledSpecialties,
} from "@/lib/conditionProfileServer";
import { isConditionSpecialty, TRIAGE_QUESTIONS } from "@/lib/conditionSpecialty";

const TRIAGE_KEYS = new Set(TRIAGE_QUESTIONS.map((q) => q.key));

// Patient onboarding: the therapist triages the patient, picks Ortho /
// Neuro / Pediatrics, and fills that specialty's questions. This is the
// route that CREATES a patient's condition record, and the one that
// re-triages an existing one.
//
// Two things separate it from /submit, and both are deliberate:
//
// 1. It needs only `isTherapistAssignedToPatient`, not an approved
//    condition_access_grant. The grant queue cannot sit in front of the
//    first record ever existing -- that is exactly the failure the Pain
//    Map gate was changed to avoid ("a clinician could finish an
//    examination with nowhere to put it until an admin noticed a
//    request"). Deciding what kind of patient this is, and writing down
//    what they told you in the session you ran, is the therapist's own
//    clinical record. Editing that record later on the patient's behalf
//    is a different act and still goes through /submit + the grant.
// 2. It writes LIVE. No review queue: the patient is locked out of their
//    own health profile until this lands, so putting an admin approval in
//    between would leave them staring at a read-only screen after their
//    first session with nothing happening.
//
// Live does not mean unrecorded. Every onboarding writes an already-
// `approved` condition_change_requests row, the same pattern an admin's
// direct edit uses, so the change appears in the ordinary Review History
// with no new concept and no queue.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{
    patientId?: string;
    specialty?: unknown;
    data?: unknown;
    triageData?: unknown;
  }>(request);
  if (parseError) return parseError;

  const { patientId, data: answers } = body;
  if (!patientId) {
    return NextResponse.json({ error: "Missing patientId" }, { status: 400 });
  }
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return NextResponse.json({ error: "Missing data" }, { status: 400 });
  }
  if (!isConditionSpecialty(body.specialty)) {
    return NextResponse.json({ error: "Pick a condition type first." }, { status: 400 });
  }
  const specialty = body.specialty;

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
  const { data: actor } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (actor?.role !== "therapist") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await isTherapistAssignedToPatient(admin, user.id, patientId))) {
    return NextResponse.json({ error: "You aren't assigned to this patient." }, { status: 403 });
  }

  const existing = await loadConditionProfileCore(admin, patientId);

  // Whether a specialty may be offered is a server-side question -- an
  // admin can switch one off between the dialog rendering and the submit
  // landing, and the browser's copy of that list is never the authority.
  // The profile's current specialty is always allowed through, so
  // switching pediatrics off cannot strand an existing paediatric
  // patient's record.
  const enabled = await readEnabledSpecialties(admin);
  if (!enabled.includes(specialty) && specialty !== existing.specialty) {
    return NextResponse.json(
      { error: "That condition type is switched off. Ask an admin to enable it." },
      { status: 400 }
    );
  }

  const specialtyKeys = questionKeysForSpecialty(specialty);
  const allowedKeys = new Set(specialtyKeys);
  const invalidKeys = Object.keys(answers).filter((k) => !allowedKeys.has(k));
  if (invalidKeys.length > 0) {
    return NextResponse.json({ error: "Submission contains unknown fields." }, { status: 400 });
  }

  const questions = await loadMergedIntakeQuestions(admin, specialty);
  const missingKeys = findMissingRequiredKeys(questions, answers as Record<string, string>);
  if (missingKeys.length > 0) {
    return NextResponse.json(
      { error: "Please fill in all required fields before submitting." },
      { status: 400 }
    );
  }

  const triageData = Object.fromEntries(
    Object.entries(
      body.triageData && typeof body.triageData === "object" && !Array.isArray(body.triageData)
        ? (body.triageData as Record<string, unknown>)
        : {}
    )
      .filter(([k, v]) => TRIAGE_KEYS.has(k) && typeof v === "string")
      .map(([k, v]) => [k, v as string])
  );

  // A patient edit sitting in the review queue was written against the
  // OLD question set. Approving it after a re-triage would write answers
  // for a specialty the profile no longer has, so the pending request is
  // refused rather than silently invalidated -- the admin clears it first.
  if (existing.specialtyChosen && specialty !== existing.specialty) {
    const { count: pendingCount } = await admin
      .from("condition_change_requests")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", patientId)
      .eq("status", "pending");
    if (pendingCount && pendingCount > 0) {
      return NextResponse.json(
        {
          error:
            "There is a health profile submission awaiting admin review for this patient. It has to be reviewed before the condition type can change.",
        },
        { status: 409 }
      );
    }
  }

  // Merge rather than replace: a re-triage keeps the previous specialty's
  // answers on file (hidden, not deleted), which is only possible because
  // the three sets have disjoint key namespaces. See mergeSpecialtyAnswers.
  const mergedData = mergeSpecialtyAnswers(
    existing.data,
    answers as Record<string, string>,
    specialtyKeys
  );

  const { error: upsertError } = await admin.from("patient_condition_profiles").upsert(
    {
      patient_id: patientId,
      specialty,
      data: mergedData,
      triage_data: triageData,
      schema_version: intakeVersionForSpecialty(specialty),
      status: "active",
      last_submitted_by: user.id,
      last_submitted_role: "therapist",
      updated_at: new Date().toISOString(),
      draft_data: null,
      draft_specialty: null,
      draft_triage_data: null,
    },
    { onConflict: "patient_id" }
  );
  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  // Best-effort audit row, deliberately after the write it describes and
  // deliberately not fatal: the clinical record landing matters more than
  // its history entry, same posture as recordAdminActivity().
  await admin.from("condition_change_requests").insert({
    patient_id: patientId,
    submitted_by: user.id,
    submitted_by_role: "therapist",
    proposed_data: answers,
    proposed_specialty: specialty,
    proposed_triage_data: triageData,
    status: "approved",
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    admin_notes:
      existing.specialtyChosen && specialty !== existing.specialty
        ? "Condition type changed by the therapist at re-triage."
        : "Patient onboarding by the therapist.",
  });

  return NextResponse.json({ success: true, specialty });
}
