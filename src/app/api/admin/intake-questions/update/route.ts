import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { questionKeysForSpecialty } from "@/lib/conditionIntake";
import { isConditionSpecialty } from "@/lib/conditionSpecialty";
import { recordAdminActivity } from "@/lib/adminActivityLog";

// Admin overrides one Patient Care Intake question's wording and/or
// required-ness. Both are saved together per question (one editor row =
// one save) -- see intake_question_templates' comment in schema.sql for
// why there's no separate "override just the text" state. Only existing
// question keys can be overridden -- this isn't a question builder, see
// the plan's scope note.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("settings");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    specialty?: unknown;
    questionKey?: string;
    questionText?: string;
    required?: boolean;
  }>(request);
  if (parseError) return parseError;
  const { questionKey, questionText, required } = body;
  if (!isConditionSpecialty(body.specialty)) {
    return NextResponse.json({ error: "Missing or invalid specialty" }, { status: 400 });
  }
  const specialty = body.specialty;
  // The key must belong to the specialty named, not merely to some
  // specialty: the three sets have disjoint namespaces, and letting a
  // neuro key be saved under the ortho tab would write an override no
  // merge would ever pick up.
  const validKeys = new Set(questionKeysForSpecialty(specialty));
  if (!questionKey || !validKeys.has(questionKey) || !questionText?.trim() || typeof required !== "boolean") {
    return NextResponse.json(
      { error: "Missing or invalid questionKey/questionText/required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.from("intake_question_templates").upsert(
    {
      specialty,
      question_key: questionKey,
      question_text: questionText.trim(),
      required,
      updated_by: adminUser.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "specialty,question_key" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Who changed this, and to what. Best-effort and after the write,
  // per the audit-log rule in AGENTS.md.
  await recordAdminActivity(admin, adminUser.id, {
    action: "clinical_questions.update_intake",
    details: { specialty, questionKey },
  });

  return NextResponse.json({ success: true });
}
