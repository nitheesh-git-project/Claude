import type { SupabaseClient } from "@supabase/supabase-js";
import { readCarePlanSettings } from "@/lib/carePlanAuthoring";
import { resolveRecommendablePackage } from "@/lib/carePlanServer";
import { parseOfferSnapshot, type CarePlanOfferKind } from "@/lib/carePlans";

type AdminClient = SupabaseClient;

/**
 * The clinic's decision on a recommendation, for both routes that take one.
 *
 * A care plan is now the only route by which a patient buys a programme, so
 * what a therapist writes is a bill as well as a clinical record, and the
 * clinic sees one before the patient is asked to pay it. This module is the
 * publishing step: it moves the thread out of the queue and records who
 * decided what, and it is deliberately the *whole* of that power. Nobody
 * edits a version here -- an admin who wants different numbers writes a new
 * version through `authorCarePlanVersion()`, which keeps the therapist as
 * its author and the admin as the person at the keyboard.
 */

export const MIN_REVIEW_REASON_LENGTH = 10;

export type CarePlanReviewResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export type CarePlanDecision = "approved" | "rejected" | "edited_and_approved";

/**
 * Matches the CHECK on `care_plan_reviews`, and refuses here too so an admin
 * is told before they have retyped anything rather than by a raw constraint
 * violation.
 *
 * A reason is required for the two decisions that take something away from
 * somebody: a rejection the therapist has to act on, and an approval whose
 * numbers are not the ones they wrote. Saying plain yes needs none. Taxing
 * the only path this queue exists to let through is how a reason column
 * fills up with "ok" and stops being worth reading — and a plain approval's
 * evidence is who and when, which is already on the row.
 */
export function validateReviewReason(
  reason: string,
  decision: CarePlanDecision
): { ok: true } | { ok: false; error: string } {
  if (decision === "approved") return { ok: true };
  if (reason.trim().length < MIN_REVIEW_REASON_LENGTH) {
    return {
      ok: false,
      error:
        decision === "rejected"
          ? `Say why, in at least ${MIN_REVIEW_REASON_LENGTH} characters. Your therapist reads this and rewrites from it — a rejection with no reason reads the same as one nobody got round to.`
          : `Say what you changed and why, in at least ${MIN_REVIEW_REASON_LENGTH} characters. This goes out under the clinician's name.`,
    };
  }
  return { ok: true };
}

/**
 * Publishes a recommendation the therapist submitted.
 *
 * Three things happen and the order matters:
 *
 * 1. **CAS on `pending_review`.** Two admins opening the queue at the same
 *    moment must not both approve, and the loser has to hear about it rather
 *    than see a success for a decision somebody else made.
 * 2. **The offer window is stamped now**, not when the therapist typed it,
 *    so a plan that waited two days in the queue does not reach the patient
 *    with two days gone. The append-only trigger permits exactly this one
 *    transition -- null to a value, once.
 * 3. **The evidence row is written, and a failure to write it un-publishes
 *    the plan.** Same posture as `/api/therapist/reveal-contact`, and the
 *    opposite of the audit log's: an approval nobody can trace back to a
 *    person is the one outcome this route must not produce, so it is undone
 *    rather than left standing. The window it can be interrupted in is the
 *    reason the revert exists at all; supabase-js cannot express a
 *    transaction, and this is not a balance, so it does not earn an RPC.
 */
export async function approveCarePlan(
  admin: AdminClient,
  {
    carePlanId,
    reviewerId,
    reason,
  }: { carePlanId: string; reviewerId: string; reason?: string }
): Promise<CarePlanReviewResult> {
  const { data: plan } = await admin
    .from("care_plans")
    .select("id, status, current_version_id")
    .eq("id", carePlanId)
    .maybeSingle();

  if (!plan) {
    return { ok: false, status: 404, error: "That recommendation no longer exists." };
  }
  if (plan.status !== "pending_review") {
    return {
      ok: false,
      status: 409,
      error: "That recommendation isn't waiting for a decision any more.",
    };
  }

  // The offer is re-checked against the live catalogue BEFORE it is
  // published, not after.
  //
  // Checkout re-reads the package and refuses on a mismatch rather than
  // charging a different amount, which is right — but it means an admin
  // approving a recommendation whose package has since been re-priced,
  // deactivated or made unrecommendable publishes an offer that will fail
  // at the last step of the patient's checkout. The patient discovers the
  // clinic's stale data by having their payment refused. Better to catch it
  // here, where the person who can fix it is looking at it.
  if (plan.current_version_id) {
    const drift = await describeOfferDrift(admin, plan.current_version_id);
    if (drift) return { ok: false, status: 409, error: drift };
  }

  const { data: claimed, error: claimError } = await admin
    .from("care_plans")
    .update({
      status: "active",
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", carePlanId)
    .eq("status", "pending_review")
    .select("id")
    .maybeSingle();

  if (claimError) {
    return { ok: false, status: 500, error: claimError.message };
  }
  if (!claimed) {
    return {
      ok: false,
      status: 409,
      error: "Someone else decided this one first. Refresh to see where it landed.",
    };
  }

  if (plan.current_version_id) {
    const settings = await readCarePlanSettings(admin);
    const expiresAt = new Date(
      Date.now() + settings.expiryDays * 86_400_000
    ).toISOString();
    // Only ever on a version that has none. A second stamp would move an
    // offer window the patient has already read, and the trigger refuses it
    // regardless -- this predicate is what keeps that from being an error
    // the admin sees.
    const { error: stampError } = await admin
      .from("care_plan_versions")
      .update({ expires_at: expiresAt })
      .eq("id", plan.current_version_id)
      .is("expires_at", null);
    if (stampError) {
      console.error("Care plan approved but its offer window was not stamped", carePlanId, stampError);
    }
  }

  const recorded = await recordReview(admin, {
    carePlanId,
    versionId: plan.current_version_id,
    reviewerId,
    decision: "approved",
    reason: reason?.trim() ? reason : null,
  });
  if (!recorded) {
    await admin
      .from("care_plans")
      .update({ status: "pending_review", reviewed_by: null, reviewed_at: null })
      .eq("id", carePlanId)
      .eq("status", "active");
    return {
      ok: false,
      status: 500,
      error:
        "The approval could not be recorded, so it was not applied. The recommendation is still waiting.",
    };
  }

  return { ok: true };
}

/**
 * Turns a recommendation down.
 *
 * Rejection is the whole of what this does: the therapist rewrites, because
 * a recommendation is their clinical judgement and the reason is what tells
 * them what to change. Same CAS and same evidence rule as the approval --
 * a rejection nobody can trace is a recommendation that silently never
 * happened, and the therapist is the one person who has to act on it.
 */
export async function rejectCarePlan(
  admin: AdminClient,
  {
    carePlanId,
    reviewerId,
    reason,
  }: { carePlanId: string; reviewerId: string; reason: string }
): Promise<CarePlanReviewResult> {
  const { data: plan } = await admin
    .from("care_plans")
    .select("id, status, current_version_id")
    .eq("id", carePlanId)
    .maybeSingle();

  if (!plan) {
    return { ok: false, status: 404, error: "That recommendation no longer exists." };
  }
  if (plan.status !== "pending_review") {
    return {
      ok: false,
      status: 409,
      error: "That recommendation isn't waiting for a decision any more.",
    };
  }

  // No catalogue re-check here, deliberately. A recommendation being turned
  // down does not have to be sellable -- and refusing to let an admin close
  // a thread because its package has since been withdrawn would trap the
  // one recommendation most likely to need closing.
  const { data: claimed, error: claimError } = await admin
    .from("care_plans")
    .update({
      status: "rejected",
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", carePlanId)
    .eq("status", "pending_review")
    .select("id")
    .maybeSingle();

  if (claimError) {
    return { ok: false, status: 500, error: claimError.message };
  }
  if (!claimed) {
    return {
      ok: false,
      status: 409,
      error: "Someone else decided this one first. Refresh to see where it landed.",
    };
  }

  const recorded = await recordReview(admin, {
    carePlanId,
    versionId: plan.current_version_id,
    reviewerId,
    decision: "rejected",
    reason,
  });
  if (!recorded) {
    await admin
      .from("care_plans")
      .update({ status: "pending_review", reviewed_by: null, reviewed_at: null })
      .eq("id", carePlanId)
      .eq("status", "rejected");
    return {
      ok: false,
      status: 500,
      error:
        "The decision could not be recorded, so it was not applied. The recommendation is still waiting.",
    };
  }

  return { ok: true };
}

/** The evidence row. Returns false rather than throwing, because both
 *  callers have a state change to undo when it fails. */
export async function recordReview(
  admin: AdminClient,
  {
    carePlanId,
    versionId,
    reviewerId,
    decision,
    reason,
  }: {
    carePlanId: string;
    versionId: string | null;
    reviewerId: string;
    decision: CarePlanDecision;
    reason: string | null;
  }
): Promise<boolean> {
  try {
    const { error } = await admin.from("care_plan_reviews").insert({
      care_plan_id: carePlanId,
      version_id: versionId,
      reviewer_id: reviewerId,
      decision,
      reason: reason?.trim() || null,
    });
    if (error) {
      console.error("Could not record a care-plan review", carePlanId, error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("Could not record a care-plan review", carePlanId, e);
    return false;
  }
}

/**
 * Whether the catalogue still says what the recommendation says it says.
 *
 * Returns a sentence for an admin when it does not, and null when the offer
 * is still good. Only the two numbers a patient reads and pays are compared
 * — the session count and the price — because those are what checkout
 * refuses on, and flagging a changed `terms` string would stop an approval
 * for something nobody would notice.
 *
 * Failure-tolerant in the safe direction: if the package cannot be resolved
 * at all, that IS the finding (it has been deactivated or taken off the
 * recommendable list), and an unreadable snapshot is treated as fine rather
 * than blocking a queue on a parsing problem.
 */
export async function describeOfferDrift(
  admin: AdminClient,
  versionId: string
): Promise<string | null> {
  try {
    const { data: version } = await admin
      .from("care_plan_versions")
      .select("offer_kind, session_package_id, home_visit_package_id, offer_snapshot")
      .eq("id", versionId)
      .maybeSingle();
    if (!version) return null;

    const packageId = version.session_package_id ?? version.home_visit_package_id;
    if (!packageId) return null;

    const resolved = await resolveRecommendablePackage(
      admin,
      version.offer_kind as CarePlanOfferKind,
      packageId
    );
    if (!resolved) {
      return "The programme behind this recommendation is no longer active or recommendable, so the patient could not buy it. Put it back on the catalogue, or turn this down and ask for a fresh recommendation.";
    }

    const was = parseOfferSnapshot(version.offer_snapshot);
    if (!was) return null;

    if (was.sessionCount !== resolved.snapshot.sessionCount) {
      return `This was written for ${was.sessionCount} sessions and the programme now has ${resolved.snapshot.sessionCount}. Approving it would offer the patient a plan checkout then refuses. Turn it down and ask for a fresh recommendation.`;
    }
    if (was.pricePaise !== resolved.snapshot.pricePaise) {
      const inr = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;
      return `This was written at ${inr(was.pricePaise)} and the programme now costs ${inr(resolved.snapshot.pricePaise)}. Approving it would quote one figure and charge another. Turn it down and ask for a fresh recommendation.`;
    }
    return null;
  } catch {
    // A read that fails must not hold up a queue with a patient behind it.
    return null;
  }
}
