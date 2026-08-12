import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActiveAndApproved } from "@/lib/supabase/requireActiveProfile";
import { hasApprovedConditionAccess } from "@/lib/conditionAccess";
import {
  isPainMapRegion,
  regionRequiresSide,
  getDefaultQuestionsForRegion,
  mergeQuestionOverrides,
  type PainMapSide,
} from "@/lib/painMap";

type AnswerInput = { key: string; value: string };

// Therapist posts one region's clinical exam findings. Unlike the general
// intake, this does NOT queue for admin review — it's the therapist's own
// clinical judgement, live immediately (see schema.sql's section comment).
// Still gated by the same condition_access_grants approval as the intake,
// and rows are append-only: a re-assessment is a new row, never an edit,
// so the Pain Map can show a trend against the previous visit.
export async function POST(request: NextRequest) {
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
  if (!(await hasApprovedConditionAccess(admin, user.id, patientId))) {
    return NextResponse.json(
      { error: "You don't have an approved access grant for this patient's health profile." },
      { status: 403 }
    );
  }

  // Build the region's current question set (code defaults + any admin
  // overrides) and snapshot the exact wording shown at submit time into
  // each answer row — see pain_assessments.answers' column comment in
  // schema.sql for why this must never be re-derived from the live
  // template later.
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
    submitted_by: user.id,
    submitted_by_role: "therapist",
    answers: snapshot,
    pain_percent: Math.round(painPercent),
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
