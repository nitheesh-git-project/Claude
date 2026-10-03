import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReferralAttributionHealth } from "@/lib/systemHealth";

/**
 * Referred patients whose account does not say who referred them.
 *
 * `/api/patient/register-via-referral` writes
 * `profiles.referred_by_hospital_id` on the new patient, and that column is
 * what every commission figure is worked out from. The write was
 * best-effort behind a `console.error`, so a failure meant the partner
 * silently earned nothing on that patient -- not on the first session, not
 * on any of them -- and nothing in the product noticed. The route's own
 * comment said it "would silently break revenue attribution" and left it
 * there.
 *
 * `patient_referrals.converted_patient_id` is what makes it detectable: the
 * referral records who it became, so the two can be compared. This is that
 * comparison, and it is the durable reconciliation the attribution write
 * needed rather than a second best-effort attempt.
 *
 * Returns null when it could not be asked, so the check reports "could not
 * be checked" rather than agreement -- the rule this codebase holds
 * everywhere: a read that failed is not a read that came back empty.
 */
export async function readReferralAttributionHealth(
  admin: SupabaseClient
): Promise<ReferralAttributionHealth | null> {
  try {
    // Every converted referral, linked or not. This used to read only rows
    // where converted_patient_id was set -- so the failure that most needed
    // finding, the link itself not being written, was the one it could not
    // see. An unlinked converted referral is counted on its own.
    const { data: allConverted, error } = await admin
      .from("patient_referrals")
      .select("hospital_id, converted_patient_id")
      .eq("status", "converted");

    if (error) return null;
    const unlinkedCount = (allConverted ?? []).filter((r) => !r.converted_patient_id).length;
    const converted = (allConverted ?? []).filter((r) => !!r.converted_patient_id);
    if (converted.length === 0) {
      return { orphanedCount: 0, withCompletedSessions: 0, unlinkedCount };
    }

    const patientIds = converted
      .map((r) => r.converted_patient_id as string | null)
      .filter((id): id is string => !!id);
    if (patientIds.length === 0) {
      return { orphanedCount: 0, withCompletedSessions: 0, unlinkedCount };
    }

    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("id, referred_by_hospital_id")
      .in("id", patientIds);
    if (profileError) return null;

    const attributed = new Map(
      (profiles ?? []).map((p) => [p.id, p.referred_by_hospital_id as string | null])
    );

    // Missing, or pointing at a different partner from the one whose
    // referral converted them. The second is rarer and worse: a commission
    // going to somebody who did not send the patient.
    const orphaned = converted.filter((r) => {
      const id = r.converted_patient_id as string | null;
      if (!id) return false;
      const recorded = attributed.get(id) ?? null;
      return recorded !== r.hospital_id;
    });

    if (orphaned.length === 0) {
      return { orphanedCount: 0, withCompletedSessions: 0, unlinkedCount };
    }

    const orphanIds = orphaned
      .map((r) => r.converted_patient_id as string)
      .filter(Boolean);

    // How many of them have had work delivered. This is what moves the
    // check from amber to red: before a session completes nothing has been
    // mis-split and the fix is one edit, after it a commission has genuinely
    // been worked out without the partner.
    const { data: delivered } = await admin
      .from("appointments")
      .select("patient_id")
      .in("patient_id", orphanIds)
      .eq("status", "completed");

    const withSessions = new Set((delivered ?? []).map((a) => a.patient_id as string));

    return {
      orphanedCount: orphaned.length,
      withCompletedSessions: withSessions.size,
      unlinkedCount,
    };
  } catch {
    return null;
  }
}
