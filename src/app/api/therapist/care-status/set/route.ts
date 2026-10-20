import { NextRequest, NextResponse } from "next/server";
import { recordUserActivity } from "@/lib/userActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { requireAssignedTherapist, requireSignedInUser } from "@/lib/therapistClinicalGate";
import { applyCareStatusChange } from "@/lib/careStatusRoute";

// The assigned therapist sets the patient's current phase (one of the
// profile kind's four, milestoneTemplates.ts) or overrules the computed
// status pill (Improving / Holding steady / Needs attention) with a reason,
// or clears their override. Every change is an append-only
// care_status_events row, so the history of who said what, when and why is
// kept (src/lib/careStatus.ts shapes what is in force).
//
// Gate: assigned under the clinical-access rule, the mirror of
// care_status_events_insert_assigned_therapist -- a judgement about the plan
// needs the assignment, not a started session (as a goal does). The role,
// the assignment and the profile kind are re-derived on the server; the
// phase must be one of that kind's. The reason reaches the patient, so it is
// scanned (care_status_reason).
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
//           400 validation ({ code: "reason_required" } for an override
//               without a reason), 403 not a therapist / not assigned
//               ({ code: "not_assigned" }),
//           409 { code: "no_condition_profile" } | { code: "no_override" },
//           503 a check that could not be run.
export async function POST(request: NextRequest) {
  const who = await requireSignedInUser();
  if (!who.ok) return who.response;

  const { data: body, error: parseError } = await parseJsonBody<Record<string, unknown>>(request);
  if (parseError) return parseError;
  const patientId = typeof body.patientId === "string" ? body.patientId.trim() : "";
  if (!patientId) return NextResponse.json({ error: "Missing patientId" }, { status: 400 });

  const gate = await requireAssignedTherapist(
    who.userId,
    patientId,
    "You can only set the phase or status for a patient you've been assigned to."
  );
  if (!gate.ok) return gate.response;
  const { admin, therapistId } = gate;

  const applied = await applyCareStatusChange(admin, "therapist/care-status/set", {
    patientId,
    body,
    actorId: therapistId,
    actorRole: "therapist",
  });
  if (!applied.ok) return applied.response;

  if (!applied.unchanged) {
    await recordUserActivity(admin, {
      action: "care_status.set",
      actor: { id: therapistId, role: "therapist" },
      patientId,
      therapistId,
    });
  }
  return NextResponse.json({ success: true, unchanged: applied.unchanged, event: applied.event, state: applied.state });
}
