import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { applyCareStatusChange, careStatusAuditDetails } from "@/lib/careStatusRoute";

// An admin sets a patient's current phase or overrules (or clears) the
// computed status pill -- the counterpart of
// /api/therapist/care-status/set, through the same shared helper
// (applyCareStatusChange) so neither door stores what the other refuses.
//
// "people" scope, like the other admin writes to a patient's clinical record
// (/api/admin/measurements/submit, /api/admin/care-milestones/reopen); no
// assignment or session gate. Every change is an append-only
// care_status_events row with set_by_role "admin", plus a care_status.set
// audit row with from and to. Goals and milestones are NOT editable here or
// anywhere in the back office: they stay therapist-authored (the owner's
// decision); the one admin door on them is reopening a milestone marked
// reached by mistake.
//
// Request:  { patientId: string } and one of
//             { action: "set_phase", phase: string, reason?: string }
//             { action: "override_status",
//               status: "improving" | "steady" | "needs_attention",
//               reason: string }                       (>= 10 characters)
//             { action: "clear_override", reason?: string }
//           (CareStatusRequest, src/lib/careStatus.ts)
// Response: 200 { success: true, unchanged: boolean,
//                 event: CareStatusEvent | null, state: CareStatusState }
//           400 validation ({ code: "reason_required" }), 403 scope,
//           404 no such patient,
//           409 { code: "no_condition_profile" } | { code: "no_override" },
//           503 a check that could not be run.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<Record<string, unknown>>(request);
  if (parseError) return parseError;
  const patientId = typeof body.patientId === "string" ? body.patientId.trim() : "";
  if (!patientId) return NextResponse.json({ error: "Missing patientId" }, { status: 400 });

  const admin = createAdminClient();
  const { data: patient, error: patientError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", patientId)
    .eq("role", "patient")
    .maybeSingle();
  // "We couldn't check" is not "no such patient".
  if (patientError && patientError.code !== "22P02") {
    return NextResponse.json({ error: "We couldn't check this patient just now. Please try again." }, { status: 503 });
  }
  if (!patient) return NextResponse.json({ error: "No such patient." }, { status: 404 });

  const applied = await applyCareStatusChange(admin, "admin/care-status/set", {
    patientId,
    body,
    actorId: adminUser.id,
    actorRole: "admin",
  });
  if (!applied.ok) return applied.response;

  // Best-effort and after the write, per the audit-log rule.
  if (!applied.unchanged) {
    await recordAdminActivity(admin, adminUser.id, {
      action: "care_status.set",
      targetId: patientId,
      details: careStatusAuditDetails(applied),
    });
  }
  return NextResponse.json({ success: true, unchanged: applied.unchanged, event: applied.event, state: applied.state });
}
