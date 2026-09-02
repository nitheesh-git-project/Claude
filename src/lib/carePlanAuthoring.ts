import type { createAdminClient } from "@/lib/supabase/admin";
import { resolveRecommendablePackage } from "@/lib/carePlanServer";
import { validateCarePlanInput, type CarePlanOfferKind } from "@/lib/carePlans";
import { guardCommunication } from "@/lib/communicationFlags";

type AdminClient = ReturnType<typeof createAdminClient>;

export const DEFAULT_CARE_PLAN_EXPIRY_DAYS = 30;
export const DEFAULT_CARE_PLAN_MAX_FREQUENCY = 5;

/**
 * Writing a care plan version, for both the people allowed to write one.
 *
 * A therapist writes their own from the session note dialog; an admin writes
 * one on a therapist's behalf when that therapist cannot reach the dashboard.
 * Those are two doors into exactly one set of rules -- the package comes from
 * the admin whitelist, the source session must be a completed one that
 * therapist ran, the text is scanned, the thread is append-only, and a
 * purchased plan is never re-versioned. Keeping them as one function is what
 * stops the second door quietly growing weaker rules than the first.
 *
 * The caller decides only two things: whose clinical judgement this is
 * (`authoredBy`) and who was at the keyboard (`enteredBy`, null when they are
 * the same person).
 */
export type CarePlanAuthorRequest = {
  patientId: string;
  appointmentId: string;
  offerKind: CarePlanOfferKind;
  packageId: string;
  handsOnRequired: boolean;
  frequencyPerWeek: number | null;
  clinicalRationale: string;
  instructions: string;
  /** The clinician the recommendation belongs to. */
  authoredBy: string;
  /** The admin who typed it, when that is not the clinician. */
  enteredBy?: string | null;
  /** Who the scanner should record as the writer. */
  actorRole: "therapist" | "admin";
  /**
   * Whether this version is published on the spot or queued for the clinic.
   *
   * Decided by the caller rather than read here, because the two doors have
   * genuinely different answers: a therapist's submission waits when
   * `care_plan_requires_approval` is on, while an admin authoring on a
   * therapist's behalf IS the approver, and sending their own typing to
   * their own queue would be a step that means nothing.
   */
  landsApproved: boolean;
  /** How long the patient has to answer, once it reaches them. Stamped at
   *  publication, so a plan that waited in the queue does not reach the
   *  patient with its window already spent. */
  expiresAt?: string | null;
};

export type CarePlanAuthorResult =
  | { ok: true; carePlanId: string; versionId: string; versionNo: number }
  | { ok: false; status: number; error: string };

export async function authorCarePlanVersion(
  admin: AdminClient,
  request: CarePlanAuthorRequest
): Promise<CarePlanAuthorResult> {
  const {
    patientId,
    appointmentId,
    offerKind,
    packageId,
    authoredBy,
    enteredBy = null,
    actorRole,
    landsApproved,
  } = request;

  // The session this comes out of. Re-derived, never taken from the body: it
  // has to be the named therapist's, this patient's, and actually delivered.
  // That is what makes "recommend to everyone and see who bites" impossible
  // rather than merely discouraged -- and it holds for the admin's door too,
  // so an admin cannot conjure a recommendation from no session at all.
  const { data: appointment } = await admin
    .from("appointments")
    .select("id, patient_id, therapist_id, status, category_id")
    .eq("id", appointmentId)
    .maybeSingle();

  if (
    !appointment ||
    appointment.patient_id !== patientId ||
    appointment.therapist_id !== authoredBy
  ) {
    return {
      ok: false,
      status: 403,
      error: "That session isn't this therapist's, or isn't this patient's.",
    };
  }
  if (appointment.status !== "completed") {
    return {
      ok: false,
      status: 409,
      error:
        "A recommendation is written after a session has been marked complete — that is what it is based on.",
    };
  }

  const resolved = await resolveRecommendablePackage(admin, offerKind, packageId);
  if (!resolved) {
    return { ok: false, status: 400, error: "That programme isn't available to recommend." };
  }

  const input = {
    offerKind,
    packageId,
    handsOnRequired: request.handsOnRequired,
    frequencyPerWeek: request.frequencyPerWeek,
    clinicalRationale: request.clinicalRationale.trim(),
    instructions: request.instructions.trim(),
  };

  const settings = await readCarePlanSettings(admin);
  const validation = validateCarePlanInput(input, resolved.snapshot, {
    maxFrequencyPerWeek: settings.maxFrequencyPerWeek,
  });
  if (!validation.ok) {
    return { ok: false, status: 400, error: validation.error };
  }

  // Both free-text fields are read by the patient -- they are the offer, not
  // clinician-to-clinician notes -- so they are scanned whoever typed them.
  const leak = await guardCommunication(
    admin,
    [
      { surface: "care_plan_rationale", text: input.clinicalRationale },
      { surface: "care_plan_instructions", text: input.instructions },
    ],
    { authorId: enteredBy ?? authoredBy, authorRole: actorRole, patientId }
  );
  if (leak.blockedMessage) {
    return { ok: false, status: 400, error: leak.blockedMessage };
  }

  const { data: note } = await admin
    .from("session_notes")
    .select("id")
    .eq("appointment_id", appointmentId)
    .maybeSingle();

  // Null while the plan is queued. The approval stamps it, so the patient's
  // window starts when they can actually see the offer rather than when the
  // therapist typed it -- otherwise the plans the clinic took longest over
  // are the ones that reach the patient with the least time on them.
  const expiresAt = landsApproved
    ? request.expiresAt ??
      new Date(Date.now() + settings.expiryDays * 86_400_000).toISOString()
    : null;

  // Either open state counts as "this patient already has a thread": one
  // waiting on the clinic and one waiting on the patient are both live, and
  // a new version belongs on the existing thread rather than opening a
  // second one the unique index would refuse anyway.
  const { data: existing } = await admin
    .from("care_plans")
    .select("id, status, therapist_id")
    .in("status", ["active", "pending_review"])
    .eq("patient_id", patientId)
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

    const { error: retireError } = await admin
      .from("care_plan_versions")
      .update({ is_current: false })
      .eq("care_plan_id", planId)
      .eq("is_current", true);
    if (retireError) {
      return { ok: false, status: 500, error: retireError.message };
    }
  } else {
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
        therapist_id: authoredBy,
        category_id: appointment.category_id ?? resolved.categoryId,
        status: landsApproved ? "active" : "pending_review",
        submitted_at: new Date().toISOString(),
        supersedes_id: previous?.id ?? null,
      })
      .select("id")
      .single();

    if (createError || !created) {
      if (createError?.code === "23505") {
        return {
          ok: false,
          status: 409,
          error:
            "This patient already has a recommendation waiting. Refresh to see it — that one can be updated instead.",
        };
      }
      return {
        ok: false,
        status: 500,
        error: createError?.message ?? "Could not start the recommendation.",
      };
    }
    planId = created.id;
  }

  const { data: version, error: versionError } = await admin
    .from("care_plan_versions")
    .insert({
      care_plan_id: planId,
      version_no: nextVersionNo,
      authored_by: authoredBy,
      entered_by: enteredBy,
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
    return {
      ok: false,
      status: 500,
      error: versionError?.message ?? "Could not save the recommendation.",
    };
  }

  // The pointer, and the thread's own state. A new version on an existing
  // thread carries that thread with it: a therapist revising a plan the
  // clinic already published sends the whole thread back for review, which
  // does take a live offer off the patient's screen -- deliberately, since
  // the offer they can now see is one nobody has approved.
  const { error: pointerError } = await admin
    .from("care_plans")
    .update({
      current_version_id: version.id,
      status: landsApproved ? "active" : "pending_review",
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", planId);
  if (pointerError) {
    console.error("Care plan version saved but the pointer failed", planId, pointerError);
  }

  return { ok: true, carePlanId: planId, versionId: version.id, versionNo: version.version_no };
}

/**
 * Both settings read in their own isolated call, per the
 * migration-dependent-column rule -- a database without them falls back to
 * the defaults rather than failing the whole submission.
 */
export async function readCarePlanSettings(
  admin: AdminClient
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
          : DEFAULT_CARE_PLAN_EXPIRY_DAYS,
      maxFrequencyPerWeek:
        typeof data?.care_plan_max_frequency_per_week === "number"
          ? data.care_plan_max_frequency_per_week
          : DEFAULT_CARE_PLAN_MAX_FREQUENCY,
    };
  } catch {
    return {
      expiryDays: DEFAULT_CARE_PLAN_EXPIRY_DAYS,
      maxFrequencyPerWeek: DEFAULT_CARE_PLAN_MAX_FREQUENCY,
    };
  }
}

/**
 * Whether a therapist's own submission waits for the clinic.
 *
 * Read in its own call, per the migration-dependent-column rule, and failing
 * **closed** -- the opposite direction from `contact_scan_mode`, and
 * deliberately so. A recommendation is now the only route by which a patient
 * buys a programme, so the safe answer to "I could not read the setting" is
 * to hold one for review, never to publish one nobody has seen.
 */
export async function readCarePlanRequiresApproval(admin: AdminClient): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from("site_settings")
      .select("care_plan_requires_approval")
      .maybeSingle();
    if (error) return true;
    return data?.care_plan_requires_approval !== false;
  } catch {
    return true;
  }
}
