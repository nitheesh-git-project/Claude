import Razorpay from "razorpay";
import type { SupabaseClient } from "@supabase/supabase-js";

type CancelResult =
  | { error: string; status: number }
  | { success: true; refunded: boolean };

/**
 * Cancels an upcoming appointment and, if it was paid, refunds the exact
 * amount charged via Razorpay — used by both the patient-facing and
 * admin-facing cancel routes so the refund logic only lives in one place.
 * Takes a service-role client since it writes fields (status, refund_*)
 * that have no client-side update policy.
 */
export async function cancelAppointmentAndRefund(
  admin: SupabaseClient,
  {
    appointmentId,
    cancelledBy,
    reason,
  }: { appointmentId: string; cancelledBy: string; reason?: string | null }
): Promise<CancelResult> {
  const { data: appointment } = await admin
    .from("appointments")
    .select(
      "id, status, payment_status, amount_paid_paise, razorpay_payment_id, therapist_payout_paid_at"
    )
    .eq("id", appointmentId)
    .single();

  if (!appointment) {
    return { error: "Appointment not found", status: 404 };
  }
  if (appointment.status !== "requested" && appointment.status !== "confirmed") {
    return { error: "Only upcoming sessions can be cancelled.", status: 400 };
  }
  // Same reasoning as update-appointment's reassignment guard: refunding a
  // session whose payout to the therapist was already settled would leave
  // the books inconsistent with no automated way to reconcile it.
  if (appointment.therapist_payout_paid_at) {
    return {
      error:
        "This session's payout has already been settled — please contact the clinic to cancel it.",
      status: 400,
    };
  }

  const needsRefund = appointment.payment_status === "paid" && !!appointment.razorpay_payment_id;
  let refundId: string | null = null;

  if (needsRefund) {
    try {
      const razorpay = new Razorpay({
        key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
        key_secret: process.env.RAZORPAY_KEY_SECRET!,
      });
      const refund = await razorpay.payments.refund(appointment.razorpay_payment_id!, {
        amount: appointment.amount_paid_paise ?? undefined,
      });
      refundId = refund.id;
    } catch (err) {
      console.error("Refund failed for appointment", appointmentId, err);
      return {
        error: "Could not process the refund. Please try again or contact us.",
        status: 502,
      };
    }
  }

  const { error } = await admin
    .from("appointments")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: cancelledBy,
      cancellation_reason: reason?.trim() ? reason.trim() : null,
      ...(needsRefund
        ? {
            refund_id: refundId,
            refund_status: "processed",
            refund_amount_paise: appointment.amount_paid_paise,
          }
        : {}),
    })
    .eq("id", appointmentId);

  if (error) {
    // The refund (if any) already succeeded with Razorpay at this point —
    // never let the caller think nothing happened.
    console.error(
      "Refund succeeded but failed to record cancellation for appointment",
      appointmentId,
      error
    );
    return {
      error: needsRefund
        ? "Refund was processed but the booking could not be updated. Please contact us."
        : error.message,
      status: 500,
    };
  }

  return { success: true, refunded: needsRefund };
}
