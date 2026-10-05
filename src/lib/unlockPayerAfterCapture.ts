import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentCaptureResult } from "@/lib/recordPaymentCapture";

/**
 * Unlocks the account behind a captured payment, whichever thing it paid
 * for. The webhook's half of approvePatientAfterPayment: it has no session
 * to read the patient from, so the patient comes from the paid row. Only a
 * `patient` row that is still unapproved changes; a failed read or write is
 * logged and left, because nothing here may turn a capture into a failure.
 */
export async function unlockPayerAfterCapture(
  admin: SupabaseClient,
  result: Pick<
    PaymentCaptureResult,
    "targetAppointmentId" | "targetPackagePurchaseId" | "targetHomeVisitPurchaseId"
  >
): Promise<void> {
  const target = result.targetAppointmentId
    ? { table: "appointments", id: result.targetAppointmentId }
    : result.targetPackagePurchaseId
      ? { table: "patient_package_purchases", id: result.targetPackagePurchaseId }
      : result.targetHomeVisitPurchaseId
        ? { table: "home_visit_package_purchases", id: result.targetHomeVisitPurchaseId }
        : null;
  if (!target) return;
  try {
    const { data: row, error } = await admin
      .from(target.table)
      .select("patient_id")
      .eq("id", target.id)
      .maybeSingle();
    if (error || !row?.patient_id) return;
    const { error: updateError } = await admin
      .from("profiles")
      .update({ approved: true })
      .eq("id", row.patient_id)
      .eq("role", "patient")
      .eq("approved", false);
    if (updateError) console.error("Could not unlock payer after capture", row.patient_id, updateError);
  } catch (err) {
    console.error("Could not unlock payer after capture", err);
  }
}
