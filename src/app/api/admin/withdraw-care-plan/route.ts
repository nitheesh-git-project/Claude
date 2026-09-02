import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";

const MIN_REASON_LENGTH = 10;

// Pulling a recommendation the clinic does not stand behind.
//
// A care plan is now the only route by which a patient can buy a programme,
// which makes a wrong one something the clinic has to be able to stop. The
// therapist's own withdraw route covers the ordinary case; this covers the
// ones it cannot -- the author is on leave, has left, or is the reason the
// plan is wrong.
//
// Deliberately the *only* thing an admin may do to a plan. There is no
// route here that edits a version: versions are append-only and a
// recommendation that changed is a new one, written by a clinician who has
// seen the patient. Withdrawing closes the thread and frees the
// one-active-plan slot, so the right therapist can recommend properly.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("sessions");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    carePlanId?: string;
    reason?: string;
  }>(request);
  if (parseError) return parseError;

  const carePlanId = body.carePlanId?.trim();
  const reason = (body.reason ?? "").trim();

  if (!carePlanId) {
    return NextResponse.json({ error: "Missing carePlanId" }, { status: 400 });
  }
  if (reason.length < MIN_REASON_LENGTH) {
    return NextResponse.json(
      { error: `Say why this is being withdrawn — at least ${MIN_REASON_LENGTH} characters.` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: plan } = await admin
    .from("care_plans")
    .select("id, status, patient_id, therapist_id")
    .eq("id", carePlanId)
    .maybeSingle();

  if (!plan) {
    return NextResponse.json({ error: "That recommendation no longer exists." }, { status: 404 });
  }
  // A purchased plan is never withdrawn: the patient has paid, the sessions
  // exist, and rewriting the plan's status would make the record disagree
  // with the money. Refunding or adjusting the credits is the right lane,
  // and it has its own routes.
  if (plan.status === "accepted") {
    return NextResponse.json(
      {
        error:
          "This recommendation has already been paid for. Refund the purchase or adjust the sessions instead — withdrawing it would leave the record disagreeing with the money.",
      },
      { status: 409 }
    );
  }
  // Either open state may be withdrawn. A recommendation still waiting for
  // the clinic's own decision is exactly the kind that turns out to be wrong,
  // and refusing to close it would leave the queue holding a thread nobody
  // intends to approve while the patient's one-plan slot stays taken.
  if (plan.status !== "active" && plan.status !== "pending_review") {
    return NextResponse.json(
      { error: "That recommendation is already closed." },
      { status: 409 }
    );
  }

  // CAS on the status, so an admin and the authoring therapist withdrawing
  // at the same moment cannot both believe theirs was the write that landed.
  const { data: claimed, error } = await admin
    .from("care_plans")
    .update({ status: "withdrawn", updated_at: new Date().toISOString() })
    .eq("id", carePlanId)
    .in("status", ["active", "pending_review"])
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!claimed) {
    return NextResponse.json(
      { error: "Someone else closed this recommendation. Refresh to see it." },
      { status: 409 }
    );
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "care_plan.withdraw",
    targetId: carePlanId,
    targetLabel: `Recommendation ${carePlanId.slice(0, 8)}`,
    details: { patientId: plan.patient_id, therapistId: plan.therapist_id, reason },
  });

  return NextResponse.json({ success: true });
}
