import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isTherapistAssignedToPatient } from "@/lib/conditionAccess";
import { type CarePlanOfferKind } from "@/lib/carePlans";
import {
  authorCarePlanVersion,
  readCarePlanRequiresApproval,
} from "@/lib/carePlanAuthoring";

// A therapist recommending treatment after a session they ran.
//
// This route is the therapist's door onto authorCarePlanVersion(); the
// admin's author-on-behalf route is the other. What lives here is who is
// allowed through it -- an approved, active therapist assigned to this
// patient -- and nothing else, because the rules about what may be
// recommended must not differ by door.
//
// **It writes into the clinic's review queue, not straight to the patient.**
// This route used to publish on save, on the same reasoning as
// /api/therapist/condition-profile/onboard -- a queue in front of a
// clinician's own judgement means the patient hears nothing for hours after
// a session that has just ended. That reasoning held while a recommendation
// was one clinical record among several. It stopped holding once a care plan
// became the only route by which a patient buys a programme: what is being
// written is now a bill, and the clinic that carries it sees one before the
// patient is asked to pay it.
//
// `care_plan_requires_approval` is the switch, read here and failing closed.
// With it off the behaviour is exactly what it was.
export async function POST(request: NextRequest) {
  // Who is asking, before anything the caller sent is looked at. An
  // anonymous request is refused here rather than after body validation,
  // so an unauthenticated caller never drives this route's parsing and is
  // never told what shape the request should have been.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    patientId?: string;
    appointmentId?: string;
    sessionNoteId?: string;
    offerKind?: string;
    packageId?: string;
    handsOnRequired?: boolean;
    frequencyPerWeek?: number | null;
    clinicalRationale?: string;
    instructions?: string;
  }>(request);
  if (parseError) return parseError;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, active, approved")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "therapist") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (profile.active === false || profile.approved === false) {
    return NextResponse.json({ error: "Your account is not active." }, { status: 403 });
  }

  const patientId = body.patientId?.trim();
  const appointmentId = body.appointmentId?.trim();
  const packageId = body.packageId?.trim();
  const offerKind = body.offerKind as CarePlanOfferKind | undefined;

  if (!patientId || !appointmentId || !packageId) {
    return NextResponse.json(
      { error: "Choose a programme for this patient." },
      { status: 400 }
    );
  }
  if (offerKind !== "session_package" && offerKind !== "home_visit_package") {
    return NextResponse.json({ error: "Unknown programme type." }, { status: 400 });
  }

  if (!(await isTherapistAssignedToPatient(admin, user.id, patientId))) {
    return NextResponse.json({ error: "That isn't your patient." }, { status: 403 });
  }

  // The rules themselves live in one place, shared with the admin's
  // author-on-behalf route, so the second door cannot grow weaker rules than
  // this one.
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
    authoredBy: user.id,
    actorRole: "therapist",
    landsApproved: !(await readCarePlanRequiresApproval(admin)),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    success: true,
    carePlanId: result.carePlanId,
    versionId: result.versionId,
    versionNo: result.versionNo,
  });
}
