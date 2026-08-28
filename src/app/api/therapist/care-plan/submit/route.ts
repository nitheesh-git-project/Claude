import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isTherapistAssignedToPatient } from "@/lib/conditionAccess";
import { resolveRecommendablePackage } from "@/lib/carePlanServer";
import { validateCarePlanInput, type CarePlanOfferKind } from "@/lib/carePlans";

const DEFAULT_EXPIRY_DAYS = 30;
const DEFAULT_MAX_FREQUENCY = 5;

// A therapist recommending treatment after a session they ran.
//
// Three things about the shape of this are load-bearing.
//
// **It writes live, with no review step.** Same reasoning as
// /api/therapist/condition-profile/onboard: an approval queue in front of a
// clinician's own judgement means the patient hears nothing for hours after
// a session that has just ended, which is the exact failure the Pain Map
// gate was changed to avoid. Live is not unrecorded -- every version is
// append-only, attributed and dated, and shows in the Health Profile's
// history like any other clinical record.
//
// **It needs a completed session this therapist ran.** Not merely an
// assignment. That is what makes "recommend to everyone and see who bites"
// impossible rather than merely discouraged, and it is why
// source_appointment_id is NOT NULL on the version.
//
// **The therapist picks a package, never a price.** The body carries a
// package id and four clinical fields. Session count, price, validity,
// duration and the gap rules are all re-read here from the catalog row. A
// therapist cannot express a discount because there is nowhere to put one.
export async function POST(request: NextRequest) {
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  // The session this comes out of. Re-derived, never taken from the body:
  // it has to be this therapist's, this patient's, and actually delivered.
  const { data: appointment } = await admin
    .from("appointments")
    .select("id, patient_id, therapist_id, status, category_id")
    .eq("id", appointmentId)
    .maybeSingle();

  if (
    !appointment ||
    appointment.patient_id !== patientId ||
    appointment.therapist_id !== user.id
  ) {
    return NextResponse.json(
      { error: "That session isn't yours, or isn't this patient's." },
      { status: 403 }
    );
  }
  if (appointment.status !== "completed") {
    return NextResponse.json(
      {
        error:
          "You can recommend treatment once the session has been marked complete — a plan is written after seeing someone.",
      },
      { status: 409 }
    );
  }

  const resolved = await resolveRecommendablePackage(admin, offerKind, packageId);
  if (!resolved) {
    return NextResponse.json(
      { error: "That programme isn't available to recommend." },
      { status: 400 }
    );
  }

  const input = {
    offerKind,
    packageId,
    handsOnRequired: body.handsOnRequired === true,
    frequencyPerWeek:
      typeof body.frequencyPerWeek === "number" ? body.frequencyPerWeek : null,
    clinicalRationale: (body.clinicalRationale ?? "").trim(),
    instructions: (body.instructions ?? "").trim(),
  };

  const settings = await readCarePlanSettings(admin);
  const validation = validateCarePlanInput(input, resolved.snapshot, {
    maxFrequencyPerWeek: settings.maxFrequencyPerWeek,
  });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // The note, when there is one. Optional because a therapist may write the
  // plan before the note, and blocking the recommendation on the paperwork
  // is the wrong way round.
  const { data: note } = await admin
    .from("session_notes")
    .select("id")
    .eq("appointment_id", appointmentId)
    .maybeSingle();

  const expiresAt = new Date(
    Date.now() + settings.expiryDays * 86_400_000
  ).toISOString();

  // Which thread this version belongs to.
  //
  // An active plan gets a new version. A plan the patient has already
  // *bought* does not: editing it would change the description of something
  // already paid for, so a later recommendation opens a new thread marked
  // as superseding the old one. That is the rule the whole design rests on
  // -- previously purchased entitlements stay immutable.
  const { data: existing } = await admin
    .from("care_plans")
    .select("id, status, therapist_id")
    .eq("patient_id", patientId)
    .eq("status", "active")
    .maybeSingle();

  let planId: string;
  let nextVersionNo = 1;

  if (existing) {
    planId = existing.id;
    const { data: latest } = await admin
      .from("care_plan_versions")
      .select("version_no")
      .eq("care_plan_id", planId)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    nextVersionNo = (latest?.version_no ?? 0) + 1;

    // Retire the outgoing version first. is_current is the one column the
    // append-only trigger lets move, and the partial unique index means
    // two concurrent submissions cannot both leave a current version
    // behind.
    const { error: retireError } = await admin
      .from("care_plan_versions")
      .update({ is_current: false })
      .eq("care_plan_id", planId)
      .eq("is_current", true);
    if (retireError) {
      return NextResponse.json({ error: retireError.message }, { status: 500 });
    }
  } else {
    // Close out any purchased thread this one follows, so the history reads
    // as a chain rather than a pile.
    const { data: previous } = await admin
      .from("care_plans")
      .select("id")
      .eq("patient_id", patientId)
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: created, error: createError } = await admin
      .from("care_plans")
      .insert({
        patient_id: patientId,
        therapist_id: user.id,
        category_id: appointment.category_id ?? resolved.categoryId,
        status: "active",
        supersedes_id: previous?.id ?? null,
      })
      .select("id")
      .single();

    if (createError || !created) {
      // 23505 is care_plans_one_active_per_patient: another submission for
      // this patient landed first. Reported as a conflict the therapist can
      // act on rather than a failure they cannot interpret.
      if (createError?.code === "23505") {
        return NextResponse.json(
          {
            error:
              "This patient already has a recommendation waiting. Refresh to see it — you can update that one instead.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: createError?.message ?? "Could not start the recommendation." },
        { status: 500 }
      );
    }
    planId = created.id;
  }

  const { data: version, error: versionError } = await admin
    .from("care_plan_versions")
    .insert({
      care_plan_id: planId,
      version_no: nextVersionNo,
      authored_by: user.id,
      source_appointment_id: appointmentId,
      source_session_note_id: note?.id ?? null,
      offer_kind: offerKind,
      session_package_id: offerKind === "session_package" ? packageId : null,
      home_visit_package_id: offerKind === "home_visit_package" ? packageId : null,
      offer_snapshot: resolved.snapshot,
      hands_on_required: input.handsOnRequired,
      frequency_per_week: input.frequencyPerWeek,
      clinical_rationale: input.clinicalRationale || null,
      instructions: input.instructions || null,
      expires_at: expiresAt,
      is_current: true,
    })
    .select("id, version_no")
    .single();

  if (versionError || !version) {
    return NextResponse.json(
      { error: versionError?.message ?? "Could not save the recommendation." },
      { status: 500 }
    );
  }

  const { error: pointerError } = await admin
    .from("care_plans")
    .update({ current_version_id: version.id, updated_at: new Date().toISOString() })
    .eq("id", planId);
  if (pointerError) {
    console.error("Care plan version saved but the pointer failed", planId, pointerError);
  }

  return NextResponse.json({
    success: true,
    carePlanId: planId,
    versionId: version.id,
    versionNo: version.version_no,
  });
}

/**
 * Both settings read in their own isolated call, per the
 * migration-dependent-column rule -- a database without them falls back to
 * the defaults rather than failing the whole submission.
 */
async function readCarePlanSettings(
  admin: ReturnType<typeof createAdminClient>
): Promise<{ expiryDays: number; maxFrequencyPerWeek: number }> {
  try {
    const { data } = await admin
      .from("site_settings")
      .select("care_plan_default_expiry_days, care_plan_max_frequency_per_week")
      .maybeSingle();
    return {
      expiryDays:
        typeof data?.care_plan_default_expiry_days === "number"
          ? data.care_plan_default_expiry_days
          : DEFAULT_EXPIRY_DAYS,
      maxFrequencyPerWeek:
        typeof data?.care_plan_max_frequency_per_week === "number"
          ? data.care_plan_max_frequency_per_week
          : DEFAULT_MAX_FREQUENCY,
    };
  } catch {
    return { expiryDays: DEFAULT_EXPIRY_DAYS, maxFrequencyPerWeek: DEFAULT_MAX_FREQUENCY };
  }
}
