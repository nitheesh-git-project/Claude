import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { INTAKE_QUESTIONS } from "@/lib/conditionIntake";

const ALLOWED_KEYS = new Set(INTAKE_QUESTIONS.map((q) => q.key));

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
  const { data: existing } = await admin
    .from("patient_condition_profiles")
    .select("status")
    .eq("patient_id", user.id)
    .maybeSingle();

  const { error } = await admin.from("patient_condition_profiles").upsert(
    {
      patient_id: user.id,
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
