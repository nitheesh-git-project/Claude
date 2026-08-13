import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";

const VALID_ACTIONS = new Set(["approve", "decline", "revoke"]);

// Approve/decline a therapist's request for write access to a patient's
// condition data, or revoke a grant that's already approved (e.g. the
// therapist was reassigned off this patient, or admin has another
// reason). See condition_access_grants in schema.sql.
export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
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
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    await admin
      .from("condition_access_grants")
      .update({
        status: "revoked",
        admin_notes: "Automatically revoked — another therapist's access request for this patient was approved.",
        decided_by: adminUser.id,
        decided_at: new Date().toISOString(),
      })
      .eq("patient_id", grant.patient_id)
      .eq("status", "approved")
      .neq("therapist_id", grant.therapist_id);
  }

  return NextResponse.json({ success: true });
}
