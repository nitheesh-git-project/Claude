import { SupabaseClient } from "@supabase/supabase-js";

import { CLINICAL_ACCESS_APPOINTMENT_STATUSES } from "@/lib/clinicalAccess";

// Shared "is this therapist assigned to this patient" check, used by the
// API routes as a defense-in-depth mirror of the RLS policies on
// patient_condition_profiles / pain_assessments / patient_medical_documents
// / session_notes in supabase/schema.sql, which encode the same rule.
//
// "Assigned" = named on one of this patient's live or delivered
// appointments (never a cancelled one), or holding the lock on a programme
// that is paid, active and not expired. See clinicalAccess.ts for why.
//
// Null when the check could not be run -- callers writing
// `if (!(await isTherapistAssignedToPatient(...)))` refuse on that too.
export async function isTherapistAssignedToPatient(
  supabase: SupabaseClient,
  therapistId: string,
  patientId: string
): Promise<boolean | null> {
  const [appointments, packages] = await Promise.all([
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", patientId)
      .eq("therapist_id", therapistId)
      .in("status", [...CLINICAL_ACCESS_APPOINTMENT_STATUSES]),
    supabase
      .from("patient_package_purchases")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", patientId)
      .eq("locked_therapist_id", therapistId)
      .eq("payment_status", "paid")
      .eq("status", "active")
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
  ]);
  if (appointments.error || packages.error) return null;
  return (appointments.count ?? 0) > 0 || (packages.count ?? 0) > 0;
}

/**
 * Whether this therapist has a session with this patient that has actually
 * started: completed, or confirmed and inside its join window. What a Pain
 * Map exam records is an observation from a session the therapist ran, so
 * being assigned is not enough -- an exam used to be recordable before any
 * treatment, or against a session that was cancelled. Null when the read
 * failed. Mirrors pain_assessments_insert_assigned_therapist.
 */
export async function hasStartedSessionWithPatient(
  supabase: SupabaseClient,
  therapistId: string,
  patientId: string,
  joinWindowMinutes: number,
  nowMs: number = Date.now()
): Promise<boolean | null> {
  const opensBy = new Date(nowMs + Math.max(0, joinWindowMinutes) * 60_000).toISOString();
  const { count, error } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", patientId)
    .eq("therapist_id", therapistId)
    .or(`status.eq.completed,and(status.eq.confirmed,slot_time.lte.${opensBy})`);
  if (error) return null;
  return (count ?? 0) > 0;
}

/** Whether a therapist currently holds an approved write-access grant for
 *  this patient's **intake** - their own account of their history, which a
 *  therapist editing on their behalf needs admin approval for.
 *
 *  Deliberately NOT the gate for a Pain Map exam any more: that records the
 *  therapist's own observation from a session they ran, the same as a
 *  session note, so it only needs `isTherapistAssignedToPatient` above. The
 *  two used to share one grant, which left a clinician with nowhere to put
 *  an examination until an admin noticed a request. */
export async function hasApprovedConditionAccess(
  supabase: SupabaseClient,
  therapistId: string,
  patientId: string
): Promise<boolean> {
  const { count } = await supabase
    .from("condition_access_grants")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", patientId)
    .eq("therapist_id", therapistId)
    .eq("status", "approved");
  return !!count && count > 0;
}
