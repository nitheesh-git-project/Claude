import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverError } from "@/lib/apiError";

const VALID_ACTIONS = new Set(["approve", "decline", "revoke"]);

// Approve/decline a therapist's request for write access to a patient's
// condition data, or revoke a grant that's already approved (e.g. the
// therapist was reassigned off this patient, or admin has another
// reason). See condition_access_grants in schema.sql.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    grantId?: string;
    action?: string;
    adminNotes?: string;
  }>(request);
  if (parseError) return parseError;
  const { grantId, action, adminNotes } = body;
  if (!grantId || !action || !VALID_ACTIONS.has(action)) {
    return NextResponse.json({ error: "Missing grantId or invalid action" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: grant } = await admin
    .from("condition_access_grants")
    .select("id, status, patient_id, therapist_id")
    .eq("id", grantId)
    .single();
  if (!grant) {
    return NextResponse.json({ error: "Grant not found" }, { status: 404 });
  }
  if (action !== "revoke" && grant.status !== "requested") {
    return NextResponse.json({ error: "This request has already been reviewed" }, { status: 400 });
  }
  if (action === "revoke" && grant.status !== "approved") {
    return NextResponse.json({ error: "Only an approved grant can be revoked" }, { status: 400 });
  }

  const nextStatus = action === "approve" ? "approved" : action === "decline" ? "declined" : "revoked";
  // The reads above are a fast path only -- two admins racing the same
  // grant could both pass them. Conditioning the update on the exact
  // status it's expected to be leaving means only one caller's write
  // actually matches a row; the other gets told it's already handled
  // instead of both applying.
  const expectedCurrentStatus = action === "revoke" ? "approved" : "requested";
  const { data: updatedRow, error } = await admin
    .from("condition_access_grants")
    .update({
      status: nextStatus,
      admin_notes: adminNotes?.trim() || null,
      decided_by: adminUser.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", grantId)
    .eq("status", expectedCurrentStatus)
    .select("id")
    .maybeSingle();
  if (error) {
    return serverError("admin/condition-access/decide", error);
  }
  if (!updatedRow) {
    return NextResponse.json(
      { error: action === "revoke" ? "This grant is no longer approved" : "This request has already been reviewed" },
      { status: 409 }
    );
  }

  // Write access is exclusive to one therapist per patient at a time --
  // approving this grant auto-revokes any other therapist's approved
  // grant for the same patient, instead of leaving two therapists able to
  // edit the same condition data simultaneously.
  if (action === "approve") {
    const { error: revokeError } = await admin
      .from("condition_access_grants")
      .update({
        status: "revoked",
        admin_notes: "Automatically revoked - another therapist's access request for this patient was approved.",
        decided_by: adminUser.id,
        decided_at: new Date().toISOString(),
      })
      .eq("patient_id", grant.patient_id)
      .eq("status", "approved")
      .neq("therapist_id", grant.therapist_id);

    if (revokeError) {
      // This write's error was not checked at all, and it is the one that
      // makes the approval *exclusive*. A failure here left two therapists
      // both holding approved write access to the same patient's health
      // profile -- precisely the invariant the comment above says this exists
      // to protect, and the admin was told the approval had succeeded.
      //
      // So the approval is un-made rather than left standing: an approval
      // that did not achieve exclusivity is worse than no approval, because
      // nothing on any screen would say which of the two therapists is meant
      // to be editing.
      await admin
        .from("condition_access_grants")
        .update({
          status: "requested",
          admin_notes: null,
          decided_by: null,
          decided_at: null,
        })
        .eq("id", grantId)
        // Only while it is still the approval this request wrote.
        .eq("status", "approved");

      return serverError("admin/condition-access/decide (exclusivity)", revokeError, {
        message:
          "Another therapist's access could not be withdrawn, so this request has been left pending rather than granting two people write access at once. Please try again.",
      });
    }
  }

  // Who changed this, and to what. Best-effort and after the write,
  // per the audit-log rule in AGENTS.md.
  await recordAdminActivity(admin, adminUser.id, {
    action: "condition_access.decide",
    targetId: grantId,
    details: { action },
  });

  return NextResponse.json({ success: true });
}
