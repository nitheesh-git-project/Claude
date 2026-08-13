import { SupabaseClient } from "@supabase/supabase-js";

// Shared "is this therapist assigned to this patient" check, used by the
// API routes as a defense-in-depth mirror of the RLS policies on
// condition_access_grants / patient_condition_profiles / pain_assessments
// in supabase/schema.sql (which encode the same rule at the database
// level). "Assigned" = has ever had an appointment with this patient, or
// holds a package's locked_therapist_id — see that schema section's
// comment for why this is intentionally broader than strictly "current".
export async function isTherapistAssignedToPatient(
  supabase: SupabaseClient,
  therapistId: string,
  patientId: string
): Promise<boolean> {
  const [{ count: appointmentCount }, { count: packageCount }] = await Promise.all([
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", patientId)
      .eq("therapist_id", therapistId),
    supabase
      .from("patient_package_purchases")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", patientId)
      .eq("locked_therapist_id", therapistId),
  ]);
  return (!!appointmentCount && appointmentCount > 0) || (!!packageCount && packageCount > 0);
}

/** Whether a therapist currently holds an approved write-access grant for
 *  this patient's condition data (general intake + Pain Map share one
 *  grant — see the schema section comment for why). */
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
