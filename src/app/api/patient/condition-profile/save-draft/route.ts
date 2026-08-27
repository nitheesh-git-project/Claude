import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { patientIntakeGate, questionKeysForSpecialty } from "@/lib/conditionIntake";
import { loadConditionProfileCore } from "@/lib/conditionProfileServer";

// Silent autosave while a patient is filling the intake form — not a
// submission, doesn't touch condition_change_requests, doesn't need admin
// review. Only moves status from not_started to draft (a profile that
// already has approved data, or is mid-review, keeps its own status —
// draft_data is purely a resume buffer for whatever's currently open in
// the form).
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

  const admin = createAdminClient();
  const existing = await loadConditionProfileCore(admin, user.id);
  const gate = patientIntakeGate(existing);
  if (!gate.canEdit) {
    return NextResponse.json(
      {
        error:
          gate.reason === "awaiting_therapist"
            ? "Your therapist fills this in with you at your first session."
            : "Your last change to your health profile is still being checked by the clinic.",
      },
      { status: gate.reason === "awaiting_therapist" ? 403 : 409 }
    );
  }

  const allowedKeys = new Set(questionKeysForSpecialty(existing.specialty));
  const invalidKeys = Object.keys(answers).filter((k) => !allowedKeys.has(k));
  if (invalidKeys.length > 0) {
    return NextResponse.json({ error: "Submission contains unknown fields." }, { status: 400 });
  }

  const { error } = await admin.from("patient_condition_profiles").upsert(
    {
      patient_id: user.id,
      draft_data: answers,
      draft_saved_by_role: "patient",
      status: !existing.exists || existing.status === "not_started" ? "draft" : existing.status,
    },
    { onConflict: "patient_id" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
