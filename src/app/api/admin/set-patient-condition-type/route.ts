import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverError } from "@/lib/apiError";
import { CONDITION_SPECIALTIES, isConditionSpecialty } from "@/lib/conditionSpecialty";
import { loadConditionProfileCore, readEnabledSpecialties } from "@/lib/conditionProfileServer";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A Master Admin changes a patient's condition type (orthopaedic,
 * neurological, paediatric...) from People -> Patients -> the profile.
 *
 * The therapist sets it at onboarding and re-triages it with that type's
 * questions answered. An admin has not seen the patient, so this changes the
 * type only: every answer on file is kept (answers are keyed per type, so
 * the earlier type's stay where they were), and the new type's own
 * questions are answered by the therapist at the next session from the
 * Health Profile screen they already use. The same two refusals as the
 * therapist's route: a type switched off cannot be newly chosen, and a
 * submission still awaiting review must be decided first. Recorded twice --
 * as an approved condition_change_requests row (the record's own history)
 * and in the activity log.
 */
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser || adminUser.scope !== "full") {
    return NextResponse.json({ error: "Only a Master Admin can change a patient's condition type." }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{ patientId?: unknown; specialty?: unknown }>(request);
  if (parseError) return parseError;
  const { patientId, specialty } = body;
  if (typeof patientId !== "string" || !UUID_RE.test(patientId)) {
    return NextResponse.json({ error: "Missing or invalid patientId" }, { status: 400 });
  }
  if (!isConditionSpecialty(specialty)) {
    return NextResponse.json({ error: "Choose one of the condition types." }, { status: 400 });
  }

  const admin = createAdminClient();
  const existing = await loadConditionProfileCore(admin, patientId);
  if (!existing.exists || !existing.specialtyChosen) {
    return NextResponse.json(
      {
        error:
          "This patient has not been onboarded yet. Their therapist chooses the condition type with them in the first session.",
      },
      { status: 409 }
    );
  }
  if (existing.specialty === specialty) return NextResponse.json({ success: true, unchanged: true });

  const enabled = await readEnabledSpecialties(admin);
  if (!enabled.includes(specialty)) {
    return NextResponse.json({ error: "That condition type is switched off. Enable it in Settings first." }, { status: 400 });
  }

  const { count: pending, error: pendingError } = await admin
    .from("condition_change_requests")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", patientId)
    .eq("status", "pending");
  if (pendingError) return serverError("admin/set-patient-condition-type (pending)", pendingError);
  if (pending && pending > 0) {
    return NextResponse.json(
      { error: "A health profile submission for this patient is awaiting review. Decide it first, then change the type." },
      { status: 409 }
    );
  }

  const nowIso = new Date().toISOString();
  // Compare-and-swap on the type it had, so two admins cannot both "change"
  // it from the same starting point.
  const { data: claimed, error } = await admin
    .from("patient_condition_profiles")
    .update({
      specialty,
      last_submitted_by: adminUser.id,
      last_submitted_role: "admin",
      updated_at: nowIso,
    })
    .eq("patient_id", patientId)
    .eq("specialty", existing.specialty as string)
    .select("patient_id")
    .maybeSingle();
  if (error) return serverError("admin/set-patient-condition-type", error);
  if (!claimed) {
    return NextResponse.json(
      { error: "Someone changed this patient's health profile a moment ago. Reload to see where it landed." },
      { status: 409 }
    );
  }

  const label = (key: unknown) => CONDITION_SPECIALTIES.find((s) => s.key === key)?.label ?? String(key ?? "none");
  await admin.from("condition_change_requests").insert({
    patient_id: patientId,
    submitted_by: adminUser.id,
    submitted_by_role: "admin",
    proposed_data: {},
    proposed_specialty: specialty,
    status: "approved",
    reviewed_by: adminUser.id,
    reviewed_at: nowIso,
    admin_notes: `Condition type changed by a Master Admin from ${label(existing.specialty)} to ${label(specialty)}. The therapist answers the new type's questions at the next session.`,
  });
  await recordAdminActivity(admin, adminUser.id, {
    action: "patient.set_condition_type",
    targetId: patientId,
    details: { from: existing.specialty ?? null, to: specialty },
  });
  return NextResponse.json({ success: true });
}
