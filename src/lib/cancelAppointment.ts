import Razorpay from "razorpay";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CANCELLATION_FULL_REFUND_HOURS } from "@/lib/pricing";

type CancelResult =
  | { error: string; status: number }
  | { success: true; refunded: boolean; refundFailed?: boolean };

/**
 * Cancels an upcoming appointment and, if it was paid, refunds the exact
 * amount charged via Razorpay (or gives a package-booked session back to
 * the patient's balance) — used by both the patient-facing and
 * admin-facing cancel routes so this logic only lives in one place.
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
      "id, status, slot_time, payment_status, amount_paid_paise, razorpay_payment_id, therapist_payout_paid_at, package_purchase_id"
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

  // A directly-paid session has a razorpay_payment_id on the appointment
  // itself. A package-booked session has payment_status 'paid' too, but the
  // money moved on the *package purchase*, not this appointment — there's
  // nothing here for Razorpay to refund; instead the session gets given
  // back to the package's balance (unless it's a late cancellation, same
  // forfeit rule as money).
  const isDirectPayment = appointment.payment_status === "paid" && !!appointment.razorpay_payment_id;
  const isPackagePayment = appointment.payment_status === "paid" && !!appointment.package_purchase_id;

  // Missing slot_time shouldn't happen for a real, paid booking, but if it
  // ever does there's no way to judge lateness — don't penalize for a data
  // gap that isn't the patient's fault.
  const hoursUntilSlot = appointment.slot_time
    ? (new Date(appointment.slot_time).getTime() - Date.now()) / (1000 * 60 * 60)
    : null;
  const isLateCancellation =
    (isDirectPayment || isPackagePayment) &&
    hoursUntilSlot !== null &&
    hoursUntilSlot < CANCELLATION_FULL_REFUND_HOURS;

  const willRefund = isDirectPayment && !isLateCancellation;
  const willRestorePackageSession = isPackagePayment && !isLateCancellation;

  // Atomically claim the cancellation — only succeeds if the appointment is
  // still in an upcoming state. Closes the race where two concurrent cancel
  // requests (double-click past the button's disabled guard, two open
  // tabs, or a patient and admin cancelling the same session around the
  // same time) could otherwise both pass the checks above and both trigger
  // a Razorpay refund for the same payment before either one writes
  // status: 'cancelled'.
  const { data: claimed, error: claimError } = await admin
    .from("appointments")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: cancelledBy,
      cancellation_reason: reason?.trim() ? reason.trim() : null,
    })
    .eq("id", appointmentId)
    .in("status", ["requested", "confirmed"])
    .select("id")
    .maybeSingle();

  if (claimError) {
    return { error: claimError.message, status: 500 };
  }
  if (!claimed) {
    return { error: "This session has already been cancelled.", status: 409 };
  }

  // Give the package session back. Best-effort compare-and-swap on the
  // purchase row — if it loses a race against another cancellation on the
  // same package, the session simply doesn't get restored rather than
  // risking a double-restore; the appointment's own cancellation above is
  // already safely claimed regardless.
  if (willRestorePackageSession && appointment.package_purchase_id) {
    const { data: purchase } = await admin
      .from("patient_package_purchases")
      .select("id, sessions_used")
      .eq("id", appointment.package_purchase_id)
      .single();
    if (purchase && purchase.sessions_used > 0) {
      const { error: restoreError } = await admin
        .from("patient_package_purchases")
        .update({ sessions_used: purchase.sessions_used - 1 })
        .eq("id", purchase.id)
        .eq("sessions_used", purchase.sessions_used);
      if (restoreError) {
        console.error(
          "Failed to restore package session for appointment",
          appointmentId,
          restoreError
        );
      }
    }
  }

  let refundId: string | null = null;
  let refundFailed = false;

  if (willRefund) {
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
      // The cancellation itself is already committed (claimed above) — a
      // refund failure here doesn't roll that back, since the slot is
      // legitimately freed either way. It just needs manual follow-up.
      console.error("Refund failed for appointment", appointmentId, err);
      refundFailed = true;
    }
  }

  const { error: recordError } = await admin
    .from("appointments")
    .update(
      refundFailed
        ? { refund_status: "failed" }
        : willRefund
        ? {
            refund_id: refundId,
            refund_status: "processed",
            refund_amount_paise: appointment.amount_paid_paise,
          }
        : isLateCancellation
        ? { refund_status: "not_eligible", refund_amount_paise: 0 }
        : {}
    )
    .eq("id", appointmentId);

  if (recordError) {
    console.error(
      "Cancelled but failed to record refund outcome for appointment",
      appointmentId,
      recordError
    );
  }

  if (refundFailed) {
    return {
      success: true,
      refunded: false,
      refundFailed: true,
    };
  }

  return { success: true, refunded: willRefund };
}
