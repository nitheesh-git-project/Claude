import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { loadConditionProfileCore } from "@/lib/conditionProfileServer";
import {
  isPainMapRegion,
  regionRequiresSide,
  getDefaultQuestionsForRegion,
  mergeQuestionOverrides,
  type PainMapSide,
} from "@/lib/painMap";

type AnswerInput = { key: string; value: string };

// Admin posts one region's Pain Map entry directly — no access-grant
// gate (admin is the final authority, same reasoning as
// ConditionDirectEditForm for the general intake). Still append-only like
// every other pain_assessments write: this is a new row, not an edit of
// a past one, so the trend/history stays intact — see that table's
// comment in schema.sql.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    patientId?: string;
    region?: string;
    side?: string;
    answers?: AnswerInput[];
    painPercent?: number;
  }>(request);
  if (parseError) return parseError;
  const { patientId, region, side, answers, painPercent } = body;

  if (!patientId || !region) {
    return NextResponse.json({ error: "Missing patientId or region" }, { status: 400 });
  }
  if (!isPainMapRegion(region)) {
    return NextResponse.json({ error: "Unknown region" }, { status: 400 });
  }
  const needsSide = regionRequiresSide(region);
  const resolvedSide: PainMapSide = needsSide ? (side === "left" || side === "right" ? side : "") as PainMapSide : "na";
  if (needsSide && resolvedSide !== "left" && resolvedSide !== "right") {
    return NextResponse.json({ error: "This region requires a side (left/right)." }, { status: 400 });
  }
  if (typeof painPercent !== "number" || painPercent < 0 || painPercent > 100 || !Number.isFinite(painPercent)) {
    return NextResponse.json({ error: "painPercent must be a number between 0 and 100." }, { status: 400 });
  }
  if (!Array.isArray(answers)) {
    return NextResponse.json({ error: "Missing answers" }, { status: 400 });
  }

  const admin = createAdminClient();

  // The Pain Map is an ORTHOPAEDIC instrument -- seventeen body regions
  // and a pain percentage. A patient recorded as neurological or
  // paediatric does not render it, so an exam posted against one would be
  // orphaned clinical data: written, stored, and shown nowhere. Refuse it
  // instead. Rows recorded before a re-triage stay (this table is
  // append-only) and simply stop being displayed.
  const conditionProfile = await loadConditionProfileCore(admin, patientId);
  if (conditionProfile.specialty !== "ortho") {
    return NextResponse.json(
      {
        error:
          "The Pain Map applies to orthopaedic profiles. This patient is recorded under a different condition type.",
      },
      { status: 400 }
    );
  }

  const { data: overrideRows } = await admin
    .from("pain_map_question_templates")
    .select("question_key, question_text")
    .eq("region", region);
  const questions = mergeQuestionOverrides(getDefaultQuestionsForRegion(region), overrideRows ?? []);
  const questionByKey = new Map(questions.map((q) => [q.key, q]));

  const answerMap = new Map(answers.map((a) => [a.key, a.value]));
  const snapshot = questions.map((q) => ({
    question_key: q.key,
    question_text: q.text,
    input_type: q.inputType,
    answer: answerMap.get(q.key) ?? "",
  }));
  const unknownKeys = answers.filter((a) => !questionByKey.has(a.key));
  if (unknownKeys.length > 0) {
    return NextResponse.json({ error: "Submission contains unknown fields." }, { status: 400 });
  }

  const { error: insertError } = await admin.from("pain_assessments").insert({
    patient_id: patientId,
    region,
    side: resolvedSide,
    submitted_by: adminUser.id,
    submitted_by_role: "admin",
    answers: snapshot,
    pain_percent: Math.round(painPercent),
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
