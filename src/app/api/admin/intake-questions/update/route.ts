import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { INTAKE_QUESTIONS } from "@/lib/conditionIntake";

const VALID_KEYS = new Set(INTAKE_QUESTIONS.map((q) => q.key));

// Admin overrides one Patient Care Intake question's wording and/or
// required-ness. Both are saved together per question (one editor row =
// one save) -- see intake_question_templates' comment in schema.sql for
// why there's no separate "override just the text" state. Only existing
// question keys can be overridden -- this isn't a question builder, see
// the plan's scope note.
export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    questionKey?: string;
    questionText?: string;
    required?: boolean;
  }>(request);
  if (parseError) return parseError;
  const { questionKey, questionText, required } = body;
  if (!questionKey || !VALID_KEYS.has(questionKey) || !questionText?.trim() || typeof required !== "boolean") {
    return NextResponse.json(
      { error: "Missing or invalid questionKey/questionText/required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.from("intake_question_templates").upsert(
    {
      question_key: questionKey,
      question_text: questionText.trim(),
      required,
      updated_by: adminUser.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "question_key" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
