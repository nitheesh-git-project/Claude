import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { INTAKE_QUESTIONS } from "@/lib/conditionIntake";

const ALLOWED_KEYS = new Set(INTAKE_QUESTIONS.map((q) => q.key));

// Approve or decline a Patient Care Intake submission (Flow B — shared by
// patient self-submissions and therapist-on-behalf submissions alike).
// Approving copies proposed_data onto the live profile; declining requires
// a note and keeps proposed_data intact so the submitter can amend and
// resubmit instead of retyping everything.
export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    requestId?: string;
    action?: string;
    adminNotes?: string;
  }>(request);
  if (parseError) return parseError;
  const { requestId, action, adminNotes } = body;
  if (!requestId || (action !== "approve" && action !== "decline")) {
    return NextResponse.json({ error: "Missing requestId or invalid action" }, { status: 400 });
  }
  if (action === "decline" && !adminNotes?.trim()) {
    return NextResponse.json({ error: "A reason is required to decline." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: changeRequest } = await admin
    .from("condition_change_requests")
    .select("id, patient_id, submitted_by, submitted_by_role, proposed_data, status")
    .eq("id", requestId)
    .single();
  if (!changeRequest) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (changeRequest.status !== "pending") {
    return NextResponse.json({ error: "This request has already been reviewed" }, { status: 400 });
  }

  if (action === "approve") {
    const proposedData = changeRequest.proposed_data as Record<string, unknown>;
    const invalidKeys = Object.keys(proposedData).filter((k) => !ALLOWED_KEYS.has(k));
    if (invalidKeys.length > 0) {
      return NextResponse.json(
        { error: "This request contains fields that can't be applied." },
        { status: 400 }
      );
    }

    const { error: profileError } = await admin
      .from("patient_condition_profiles")
      .upsert(
        {
          patient_id: changeRequest.patient_id,
          data: proposedData,
          status: "active",
          last_submitted_by: changeRequest.submitted_by,
          last_submitted_role: changeRequest.submitted_by_role,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "patient_id" }
      );
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
  } else {
    // Declining leaves the profile's own status where it was before this
    // submission (active if there was already approved data, not_started
    // otherwise) rather than stuck on pending_review forever.
    const { data: existingProfile } = await admin
      .from("patient_condition_profiles")
      .select("data")
      .eq("patient_id", changeRequest.patient_id)
      .maybeSingle();
    const fallbackStatus =
      existingProfile?.data && Object.keys(existingProfile.data as object).length > 0
        ? "active"
        : "not_started";
    await admin
      .from("patient_condition_profiles")
      .update({ status: fallbackStatus })
      .eq("patient_id", changeRequest.patient_id);
  }

  const { error: reviewError } = await admin
    .from("condition_change_requests")
    .update({
      status: action === "approve" ? "approved" : "declined",
      admin_notes: adminNotes?.trim() || null,
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (reviewError) {
    return NextResponse.json({ error: reviewError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
