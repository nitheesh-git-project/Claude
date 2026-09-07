import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import {
  intakeVersionForSpecialty,
  mergeSpecialtyAnswers,
  questionKeysForSpecialty,
} from "@/lib/conditionIntake";
import { parseConditionSpecialty } from "@/lib/conditionSpecialty";
import { loadConditionProfileCore } from "@/lib/conditionProfileServer";
import { recordAdminActivity } from "@/lib/adminActivityLog";

// Approve or decline a Patient Care Intake submission — a patient editing
// their own record, or a therapist editing it on their behalf with an
// approved access grant. (The therapist's *first* fill does not come
// through here: it writes live via /api/therapist/condition-profile/onboard
// and records itself as an already-approved row in this same table.)
//
// Approving MERGES proposed_data onto the live profile rather than
// replacing it. `data` is one flat blob shared by all three specialty
// question sets, so a replace would delete a re-triaged patient's earlier
// record the moment a submission for their current specialty was
// approved. See mergeSpecialtyAnswers in conditionIntake.ts.
//
// Declining requires a note and keeps proposed_data intact so the
// submitter can amend and resubmit instead of retyping everything.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
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

  // proposed_specialty is a newer column, so it is read on its own and
  // merged in -- an unknown-column error here must not take the whole
  // review action down with it. A row written before the column existed
  // reads as ortho, which is what it was.
  const { data: proposedSpecialtyRow } = await admin
    .from("condition_change_requests")
    .select("proposed_specialty")
    .eq("id", requestId)
    .maybeSingle();

  const profile = await loadConditionProfileCore(admin, changeRequest.patient_id);
  // The submission was written against whichever set was current when it
  // was made; the profile's own specialty is the fallback for rows that
  // predate the column.
  const targetSpecialty = parseConditionSpecialty(
    proposedSpecialtyRow?.proposed_specialty ?? profile.specialty
  );
  const targetKeys = questionKeysForSpecialty(targetSpecialty);

  if (action === "approve") {
    const proposedData = changeRequest.proposed_data as Record<string, unknown>;
    const allowedKeys = new Set(targetKeys);
    const invalidKeys = Object.keys(proposedData).filter((k) => !allowedKeys.has(k));
    if (invalidKeys.length > 0) {
      return NextResponse.json(
        { error: "This request contains fields that can't be applied." },
        { status: 400 }
      );
    }
    // A therapist re-triaged the patient while this was sitting in the
    // queue, so these answers belong to a set the profile no longer has.
    // Refuse rather than write a record nothing will render.
    if (targetSpecialty !== profile.specialty && profile.specialtyChosen) {
      return NextResponse.json(
        {
          error:
            "The patient's condition type changed after this was submitted, so these answers no longer apply. Decline it and ask for a fresh submission.",
        },
        { status: 409 }
      );
    }
  }

  // Atomic guard: the initial read above is only for validation and early
  // messaging -- two admins acting on the same row near-simultaneously
  // could both pass it. This conditional update is the real race guard --
  // only the caller whose write actually flips a still-"pending" row wins,
  // so the side effects below only ever run once per request.
  const { data: reviewedRow, error: reviewError } = await admin
    .from("condition_change_requests")
    .update({
      status: action === "approve" ? "approved" : "declined",
      admin_notes: adminNotes?.trim() || null,
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (reviewError) {
    return NextResponse.json({ error: reviewError.message }, { status: 500 });
  }
  if (!reviewedRow) {
    return NextResponse.json({ error: "This request has already been reviewed" }, { status: 409 });
  }

  if (action === "approve") {
    const proposedData = changeRequest.proposed_data as Record<string, string>;
    const { error: profileError } = await admin
      .from("patient_condition_profiles")
      .upsert(
        {
          patient_id: changeRequest.patient_id,
          data: mergeSpecialtyAnswers(profile.data, proposedData, targetKeys),
          specialty: targetSpecialty,
          schema_version: intakeVersionForSpecialty(targetSpecialty),
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
    const fallbackStatus = profile.specialtyChosen ? "active" : "not_started";
    await admin
      .from("patient_condition_profiles")
      .update({ status: fallbackStatus })
      .eq("patient_id", changeRequest.patient_id);
  }

  // Who changed this, and to what. Best-effort and after the write,
  // per the audit-log rule in AGENTS.md.
  await recordAdminActivity(admin, adminUser.id, {
    action: "condition_change.decide",
    targetId: requestId,
    details: { action },
  });

  return NextResponse.json({ success: true });
}
