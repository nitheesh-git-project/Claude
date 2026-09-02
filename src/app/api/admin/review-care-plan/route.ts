import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import {
  approveCarePlan,
  rejectCarePlan,
  validateReviewReason,
} from "@/lib/carePlanReview";

// The clinic's decision on a recommendation waiting in the queue.
//
// One route rather than two, because approve and reject are the same
// decision with two answers, and splitting them would give a reader two
// places to look for the rule about who may take it. Changing the numbers is
// deliberately NOT here: that is a new version with the therapist still as
// its author, so it goes through /api/admin/edit-and-approve-care-plan and
// authorCarePlanVersion(), which is the only writer of a version anywhere.
//
// `sessions` scope, same as withdrawing and authoring on behalf: this is
// about what treatment is being proposed, not about the money it will later
// move.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("sessions");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    carePlanId?: string;
    decision?: string;
    reason?: string;
  }>(request);
  if (parseError) return parseError;

  const carePlanId = body.carePlanId?.trim();
  const decision = body.decision;
  const reason = (body.reason ?? "").trim();

  if (!carePlanId) {
    return NextResponse.json({ error: "Missing carePlanId" }, { status: 400 });
  }
  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.json({ error: "Unknown decision." }, { status: 400 });
  }
  const reasonCheck = validateReviewReason(reason);
  if (!reasonCheck.ok) {
    return NextResponse.json({ error: reasonCheck.error }, { status: 400 });
  }

  const admin = createAdminClient();

  // Read for the label before the state moves, so the audit row names the
  // patient rather than an id.
  const { data: plan } = await admin
    .from("care_plans")
    .select("id, patient_id")
    .eq("id", carePlanId)
    .maybeSingle();
  const { data: patient } = plan
    ? await admin.from("profiles").select("full_name").eq("id", plan.patient_id).maybeSingle()
    : { data: null };

  const result =
    decision === "approved"
      ? await approveCarePlan(admin, { carePlanId, reviewerId: adminUser.id, reason })
      : await rejectCarePlan(admin, { carePlanId, reviewerId: adminUser.id, reason });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // After the claim, per the audit-log rule: the log must not record a
  // decision that lost its race.
  await recordAdminActivity(admin, adminUser.id, {
    action: decision === "approved" ? "care_plan.approve" : "care_plan.reject",
    targetId: carePlanId,
    targetLabel: `Recommendation for ${patient?.full_name ?? "a patient"}`,
    details: { reason },
  });

  return NextResponse.json({ success: true });
}
