import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isPainMapRegion, getDefaultQuestionsForRegion } from "@/lib/painMap";

// Admin overrides one Pain Map question's wording for a region. Only
// question_text is editable — input type and display order stay
// code-defined (src/lib/painMap.ts) so an edit can't corrupt how the form
// renders. Past pain_assessments rows already snapshot the wording shown
// at the time, so this never rewrites what a historical answer was
// actually responding to.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("settings");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    region?: string;
    questionKey?: string;
    questionText?: string;
  }>(request);
  if (parseError) return parseError;
  const { region, questionKey, questionText } = body;
  if (!region || !isPainMapRegion(region) || !questionKey || !questionText?.trim()) {
    return NextResponse.json({ error: "Missing or invalid region/questionKey/questionText" }, { status: 400 });
  }

  const validKeys = new Set(getDefaultQuestionsForRegion(region).map((q) => q.key));
  if (!validKeys.has(questionKey)) {
    return NextResponse.json({ error: "Unknown questionKey for this region" }, { status: 400 });
  }

  const defaults = getDefaultQuestionsForRegion(region);
  const inputType = defaults.find((q) => q.key === questionKey)!.inputType;

  const admin = createAdminClient();
  const { error } = await admin.from("pain_map_question_templates").upsert(
    {
      region,
      question_key: questionKey,
      question_text: questionText.trim(),
      input_type: inputType,
      updated_by: adminUser.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "region,question_key" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
