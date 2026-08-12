import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { hasApprovedConditionAccess } from "@/lib/conditionAccess";
import { INTAKE_QUESTIONS } from "@/lib/conditionIntake";

const ALLOWED_KEYS = new Set(INTAKE_QUESTIONS.map((q) => q.key));

// Same silent autosave as the patient's own version, gated the same way
// as an actual therapist submission (an approved access grant) — a
// therapist without access shouldn't be able to leave draft answers
// sitting on a patient's profile either.
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

  const admin = createAdminClient();
  if (!(await hasApprovedConditionAccess(admin, user.id, patientId))) {
    return NextResponse.json(
      { error: "You don't have an approved access grant for this patient's health profile." },
      { status: 403 }
    );
  }

  const { data: existing } = await admin
    .from("patient_condition_profiles")
    .select("status")
    .eq("patient_id", patientId)
    .maybeSingle();

  const { error } = await admin.from("patient_condition_profiles").upsert(
    {
      patient_id: patientId,
      draft_data: answers,
      status: !existing || existing.status === "not_started" ? "draft" : existing.status,
    },
    { onConflict: "patient_id" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
