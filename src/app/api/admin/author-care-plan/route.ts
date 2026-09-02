import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { authorCarePlanVersion } from "@/lib/carePlanAuthoring";
import type { CarePlanOfferKind } from "@/lib/carePlans";

const MIN_REASON_LENGTH = 10;

// Writing a recommendation on a therapist's behalf.
//
// The therapist saw the patient and said what they wanted recommended, and
// then could not reach the dashboard -- on leave, off sick, or gone from the
// clinic with a patient still waiting to hear. Without this the patient waits
// for a recommendation that can never be written, and the clinic's only other
// option is to ask them to book and be seen again.
//
// It runs the identical rules the therapist's own route runs, because both
// call authorCarePlanVersion: the package comes from the admin whitelist, the
// source has to be a completed session THAT therapist ran, and there is no
// price, session-count or discount field for anyone to set. So this is a
// different person at the keyboard, not a different set of powers.
//
// Attribution is split rather than fudged. `authored_by` stays the clinician
// whose judgement it is -- the plan is theirs, and the patient is told it is
// theirs -- while `entered_by` records the admin who typed it. Recording only
// the therapist would be a quiet lie about who was at the keyboard; recording
// only the admin would be a louder one about whose clinical judgement it is.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("sessions");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    patientId?: string;
    appointmentId?: string;
    offerKind?: string;
    packageId?: string;
    handsOnRequired?: boolean;
    frequencyPerWeek?: number | null;
    clinicalRationale?: string;
    instructions?: string;
    reason?: string;
  }>(request);
  if (parseError) return parseError;

  const patientId = body.patientId?.trim();
  const appointmentId = body.appointmentId?.trim();
  const packageId = body.packageId?.trim();
  const offerKind = body.offerKind as CarePlanOfferKind | undefined;
  const reason = (body.reason ?? "").trim();

  if (!patientId || !appointmentId || !packageId) {
    return NextResponse.json(
      { error: "Choose the session this follows and the programme to recommend." },
      { status: 400 }
    );
  }
  if (offerKind !== "session_package" && offerKind !== "home_visit_package") {
    return NextResponse.json({ error: "Unknown programme type." }, { status: 400 });
  }
  // Mandatory, for the same reason every other override lane requires one:
  // this puts words in a clinician's mouth, and "why" is the part with any
  // audit value a month later.
  if (reason.length < MIN_REASON_LENGTH) {
    return NextResponse.json(
      {
        error: `Say why the clinic is writing this instead of the therapist — at least ${MIN_REASON_LENGTH} characters.`,
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Whose recommendation this is. Taken from the session rather than the
  // request body: the therapist who ran it is the only person whose judgement
  // this can honestly be attributed to, so there is nothing here for a caller
  // to name.
  const { data: appointment } = await admin
    .from("appointments")
    .select("id, therapist_id, session_code")
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appointment?.therapist_id) {
    return NextResponse.json(
      { error: "That session has no therapist on it, so there is nobody to attribute this to." },
      { status: 400 }
    );
  }

  const result = await authorCarePlanVersion(admin, {
    patientId,
    appointmentId,
    offerKind,
    packageId,
    handsOnRequired: body.handsOnRequired === true,
    frequencyPerWeek:
      typeof body.frequencyPerWeek === "number" ? body.frequencyPerWeek : null,
    clinicalRationale: body.clinicalRationale ?? "",
    instructions: body.instructions ?? "",
    authoredBy: appointment.therapist_id,
    enteredBy: adminUser.id,
    actorRole: "admin",
    // Published on the spot. The admin writing it IS the approver, so
    // routing their own typing into their own review queue would be a step
    // that decides nothing and leaves the patient waiting for it.
    landsApproved: true,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "care_plan.author_on_behalf",
    targetId: result.carePlanId,
    targetLabel: `Recommendation for ${appointment.session_code ?? appointmentId.slice(0, 8)}`,
    details: {
      patientId,
      therapistId: appointment.therapist_id,
      versionId: result.versionId,
      versionNo: result.versionNo,
      reason,
    },
  });

  return NextResponse.json({
    success: true,
    carePlanId: result.carePlanId,
    versionId: result.versionId,
    versionNo: result.versionNo,
  });
}
