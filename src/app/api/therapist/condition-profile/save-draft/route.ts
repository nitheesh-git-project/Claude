import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { hasApprovedConditionAccess, isTherapistAssignedToPatient } from "@/lib/conditionAccess";
import { questionKeysForSpecialty } from "@/lib/conditionIntake";
import { loadConditionProfileCore } from "@/lib/conditionProfileServer";
import { isConditionSpecialty } from "@/lib/conditionSpecialty";

// Same silent autosave as the patient's own version. The gate mirrors the
// two therapist write paths rather than picking one: a first fill (no
// record on file yet) needs only assignment, because that is what
// /onboard needs and a draft that could not be saved would lose a
// clinician's work mid-onboarding; editing a record that already exists
// needs the approved grant, same as /submit.
//
// The draft carries the specialty and triage answers alongside the
// answers, in their own columns rather than as magic keys inside
// draft_data -- see the schema.sql comment on draft_specialty.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{
    patientId?: string;
    data?: unknown;
    specialty?: unknown;
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "therapist") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await loadConditionProfileCore(admin, patientId);

  const allowed = existing.specialtyChosen
    ? await hasApprovedConditionAccess(admin, user.id, patientId)
    : await isTherapistAssignedToPatient(admin, user.id, patientId);
  if (!allowed) {
    return NextResponse.json(
      {
        error: existing.specialtyChosen
          ? "You don't have an approved access grant for this patient's health profile."
          : "You aren't assigned to this patient.",
      },
      { status: 403 }
    );
  }

  // A draft may be for a specialty the profile has not been switched to
  // yet -- that is the whole point of draft_specialty. Validate against
  // whichever set the draft is actually for.
  const draftSpecialty = isConditionSpecialty(body.specialty) ? body.specialty : existing.specialty;
  const allowedKeys = new Set(questionKeysForSpecialty(draftSpecialty));
  const invalidKeys = Object.keys(answers).filter((k) => !allowedKeys.has(k));
  if (invalidKeys.length > 0) {
    return NextResponse.json({ error: "Submission contains unknown fields." }, { status: 400 });
  }

  const triageData =
    body.triageData && typeof body.triageData === "object" && !Array.isArray(body.triageData)
      ? (body.triageData as Record<string, string>)
      : null;

  const { error } = await admin.from("patient_condition_profiles").upsert(
    {
      patient_id: patientId,
      draft_data: answers,
      draft_saved_by_role: "therapist",
      draft_specialty: draftSpecialty,
      ...(triageData ? { draft_triage_data: triageData } : {}),
      status: !existing.exists || existing.status === "not_started" ? "draft" : existing.status,
    },
    { onConflict: "patient_id" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
