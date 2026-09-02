import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { authorCarePlanVersion } from "@/lib/carePlanAuthoring";
import { recordReview, validateReviewReason } from "@/lib/carePlanReview";
import type { CarePlanOfferKind } from "@/lib/carePlans";

// Approving a recommendation with different numbers from the ones the
// therapist proposed.
//
// The honest shape of this is the part worth reading. An admin does **not**
// edit the therapist's version: versions are append-only by trigger, and
// rewriting one under the clinician's name would be a lie about who decided
// what. This writes a NEW version on the same thread through
// authorCarePlanVersion() -- the one writer of a version anywhere -- with
// `authored_by` still the therapist whose patient this is and `entered_by`
// the admin who changed it, and publishes that. The therapist's original
// stays on the thread as a superseded version, so the chart shows both: what
// the clinician proposed, what the clinic approved, and who made the
// difference.
//
// Everything the therapist's own door enforces still holds, because it is
// the same function: the package comes from the admin whitelist, the source
// stays the completed session that therapist ran, the text is scanned, and
// there is no price, session-count or discount field for anyone to set. An
// admin changing the numbers is changing WHICH admin-configured programme is
// being recommended, never what one costs.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("sessions");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    carePlanId?: string;
    offerKind?: string;
    packageId?: string;
    handsOnRequired?: boolean;
    frequencyPerWeek?: number | null;
    clinicalRationale?: string;
    instructions?: string;
    reason?: string;
  }>(request);
  if (parseError) return parseError;

  const carePlanId = body.carePlanId?.trim();
  const packageId = body.packageId?.trim();
  const offerKind = body.offerKind as CarePlanOfferKind | undefined;
  const reason = (body.reason ?? "").trim();

  if (!carePlanId || !packageId) {
    return NextResponse.json(
      { error: "Choose the programme this should be approved as." },
      { status: 400 }
    );
  }
  if (offerKind !== "session_package" && offerKind !== "home_visit_package") {
    return NextResponse.json({ error: "Unknown programme type." }, { status: 400 });
  }
  const reasonCheck = validateReviewReason(reason);
  if (!reasonCheck.ok) {
    return NextResponse.json({ error: reasonCheck.error }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: plan } = await admin
    .from("care_plans")
    .select("id, status, patient_id, therapist_id, current_version_id")
    .eq("id", carePlanId)
    .maybeSingle();

  if (!plan) {
    return NextResponse.json({ error: "That recommendation no longer exists." }, { status: 404 });
  }
  if (plan.status !== "pending_review") {
    return NextResponse.json(
      { error: "That recommendation isn't waiting for a decision any more." },
      { status: 409 }
    );
  }

  // The session it came out of, taken from the version rather than the body.
  // An admin approving with different numbers is not choosing a different
  // session -- the recommendation still follows the one the therapist
  // actually ran, which is what makes it a recommendation at all.
  const { data: currentVersion } = plan.current_version_id
    ? await admin
        .from("care_plan_versions")
        .select("id, source_appointment_id")
        .eq("id", plan.current_version_id)
        .maybeSingle()
    : { data: null };

  if (!currentVersion?.source_appointment_id) {
    return NextResponse.json(
      { error: "That recommendation has no session behind it to approve against." },
      { status: 409 }
    );
  }

  // Claim the queue slot before writing anything, so two admins opening the
  // queue together cannot both publish a version. Reverted below if the
  // write fails, which leaves the plan exactly where it was.
  const { data: claimed } = await admin
    .from("care_plans")
    .update({
      status: "active",
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", carePlanId)
    .eq("status", "pending_review")
    .select("id")
    .maybeSingle();

  if (!claimed) {
    return NextResponse.json(
      { error: "Someone else decided this one first. Refresh to see where it landed." },
      { status: 409 }
    );
  }

  const result = await authorCarePlanVersion(admin, {
    patientId: plan.patient_id,
    appointmentId: currentVersion.source_appointment_id,
    offerKind,
    packageId,
    handsOnRequired: body.handsOnRequired === true,
    frequencyPerWeek:
      typeof body.frequencyPerWeek === "number" ? body.frequencyPerWeek : null,
    clinicalRationale: body.clinicalRationale ?? "",
    instructions: body.instructions ?? "",
    authoredBy: plan.therapist_id,
    enteredBy: adminUser.id,
    actorRole: "admin",
    landsApproved: true,
  });

  if (!result.ok) {
    await admin
      .from("care_plans")
      .update({ status: "pending_review", reviewed_by: null, reviewed_at: null })
      .eq("id", carePlanId)
      .eq("status", "active");
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Same posture as the plain approval: a published decision nobody can
  // trace back to a person is the one outcome this must not produce. The
  // version is append-only and cannot be unwritten, so the thread goes back
  // into the queue instead -- an admin who sees it still waiting knows the
  // decision did not stick.
  const recorded = await recordReview(admin, {
    carePlanId,
    versionId: result.versionId,
    reviewerId: adminUser.id,
    decision: "edited_and_approved",
    reason,
  });
  if (!recorded) {
    await admin
      .from("care_plans")
      .update({ status: "pending_review", reviewed_by: null, reviewed_at: null })
      .eq("id", carePlanId)
      .eq("status", "active");
    return NextResponse.json(
      {
        error:
          "The decision could not be recorded, so it was not applied. The recommendation is still waiting.",
      },
      { status: 500 }
    );
  }

  const { data: patient } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", plan.patient_id)
    .maybeSingle();

  await recordAdminActivity(admin, adminUser.id, {
    action: "care_plan.edit_and_approve",
    targetId: carePlanId,
    targetLabel: `Recommendation for ${patient?.full_name ?? "a patient"}`,
    details: { reason, versionNo: result.versionNo },
  });

  return NextResponse.json({ success: true, versionId: result.versionId });
}
