import Razorpay from "razorpay";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CANCELLATION_FULL_REFUND_HOURS } from "@/lib/pricing";
import { deleteMeetEventForAppointment } from "@/lib/googleCalendarSync";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";

type CancelResult =
  | { error: string; status: number; payoutSettled?: boolean }
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
    overridePayoutSettled,
  }: {
    appointmentId: string;
    cancelledBy: string;
    reason?: string | null;
    // Admin-only escape hatch (see /api/admin/cancel-appointment) for the
    // rare case where a session was marked completed, its cash payout was
    // settled, and then it was reopened by mistake — cancelling it can't
    // touch cash that's already left the building, so this doesn't attempt
    // to reconcile therapist_payout_*; it just lets the admin free the slot
    // and record the cancellation, on the understanding that recovering the
    // payout (if warranted) is a manual, out-of-band step.
    overridePayoutSettled?: boolean;
  }
): Promise<CancelResult> {
  const { data: appointment } = await admin
    .from("appointments")
    .select(
      "id, status, slot_time, payment_status, amount_paid_paise, razorpay_payment_id, therapist_payout_paid_at, package_purchase_id, google_event_id, visit_mode, home_visit_purchase_id, payment_method, cash_collected_at, cash_collected_amount_paise"
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
  // the books inconsistent with no automated way to reconcile it. Blocked
  // by default; the admin route can pass overridePayoutSettled after an
  // explicit confirmation, since only a human can decide whether the cash
  // payout needs manual recovery.
  if (appointment.therapist_payout_paid_at && !overridePayoutSettled) {
    return {
      error: "This session's payout has already been settled — please contact the clinic to cancel it.",
      status: 400,
      payoutSettled: true,
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

  // Home visits, both payment modes. A prepaid home visit is paid on the
  // *purchase* (like a package), never on the appointment itself, so it can
  // never be isDirectPayment. A cash-on-visit appointment is purchase-backed
  // too, and legitimately sits at payment_status 'unpaid' until the
  // therapist actually collects -- see bookHomeVisitSession's own comment.
  const isHomeVisit = appointment.visit_mode === "home_visit";
  const isHomeVisitPurchaseBacked = isHomeVisit && !!appointment.home_visit_purchase_id;
  const isPrepaidHomeVisit = isHomeVisit && appointment.payment_status === "paid";
  const isCashHomeVisit = isHomeVisit && appointment.payment_method === "cash";
  const cashAlreadyCollected = isCashHomeVisit && !!appointment.cash_collected_at;

  // Both windows are admin-configurable now, and they are separate on
  // purpose: a therapist has to physically travel to a home visit, so the
  // business may reasonably want a longer notice period than a video call
  // needs. The online window used to be the fixed constant
  // CANCELLATION_FULL_REFUND_HOURS; that constant is still the fallback
  // here for a database whose settings row (or column) isn't there yet.
  //
  // Read as one isolated query per column set rather than folded into any
  // shared select, same migration-dependent-column rule the rest of this
  // codebase follows.
  let refundWindowHours = CANCELLATION_FULL_REFUND_HOURS;
  if (isHomeVisit) {
    const { data: hvSettings } = await admin
      .from("site_settings")
      .select("home_visit_cancellation_refund_hours")
      .maybeSingle();
    refundWindowHours =
      hvSettings?.home_visit_cancellation_refund_hours ??
      DEFAULT_ADMIN_SETTINGS.homeVisitCancellationRefundHours;
  } else {
    const { data: onlineSettings } = await admin
      .from("site_settings")
      .select("online_cancellation_refund_hours")
      .maybeSingle();
    refundWindowHours =
      onlineSettings?.online_cancellation_refund_hours ?? CANCELLATION_FULL_REFUND_HOURS;
  }

  // Missing slot_time shouldn't happen for a real, paid booking, but if it
  // ever does there's no way to judge lateness — don't penalize for a data
  // gap that isn't the patient's fault.
  const hoursUntilSlot = appointment.slot_time
    ? (new Date(appointment.slot_time).getTime() - Date.now()) / (1000 * 60 * 60)
    : null;
  // Home-visit purchase-backed appointments are late-checked regardless of
  // payment mode: the operational problem ("the therapist's slot is
  // essentially unfillable") is about the slot being claimed, not about
  // whether money has changed hands yet.
  const isLateCancellation =
    (isDirectPayment || isPackagePayment || isHomeVisitPurchaseBacked) &&
    hoursUntilSlot !== null &&
    hoursUntilSlot < refundWindowHours;

  const willRefund = isDirectPayment && !isLateCancellation;
  const willRestorePackageSession = isPackagePayment && !isLateCancellation;
  // Covers both payment modes: a prepaid visit gives its slot back to the
  // purchase balance (no money moves, same as a package session), and a
  // cash visit gives its slot back regardless of whether cash was ever
  // collected -- the counter tracks claimed visits, not paid ones.
  const willRestoreHomeVisit = isHomeVisitPurchaseBacked && !isLateCancellation;
  // Cash has no Razorpay payment to reverse. If it was already collected
  // and the cancellation isn't late, the business owes that cash back --
  // flagged for a human to actually hand over, via refund_status
  // 'manual_pending' surfaced on the admin Cash Ledger. Without this a
  // cancelled cash booking with money already collected would silently
  // strand: no refund record, no reminder, no trace.
  const willRefundCashManually = cashAlreadyCollected && !isLateCancellation;

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

  // Delete the Calendar event, if this session had one -- Google emails all
  // attendees the cancellation automatically. No-ops if the session was
  // only ever "requested" and never got a Meet event created.
  await deleteMeetEventForAppointment(admin, {
    appointmentId,
    googleEventId: appointment.google_event_id,
  });

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

  // The home-visit twin of the package restore above, against its own
  // purchases table. Same best-effort CAS reasoning: a losing race against
  // another cancellation on the same purchase just doesn't restore, rather
  // than risking a double-restore.
  if (willRestoreHomeVisit && appointment.home_visit_purchase_id) {
    const { data: purchase } = await admin
      .from("home_visit_package_purchases")
      .select("id, visits_used")
      .eq("id", appointment.home_visit_purchase_id)
      .single();
    if (purchase && purchase.visits_used > 0) {
      const { error: restoreError } = await admin
        .from("home_visit_package_purchases")
        .update({ visits_used: purchase.visits_used - 1 })
        .eq("id", purchase.id)
        .eq("visits_used", purchase.visits_used);
      if (restoreError) {
        console.error(
          "Failed to restore home visit for appointment",
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

  // The isLateCancellation check above was broadened to cover any
  // home-visit purchase-backed appointment regardless of payment mode, so
  // it can be true for a cash visit that never collected anything -- that
  // case has no money to be "not eligible" for, so this final write only
  // records a forfeiture where money was actually on the line.
  const isLateWithMoneyAtStake =
    isLateCancellation && (isDirectPayment || isPackagePayment || isPrepaidHomeVisit || cashAlreadyCollected);

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
        : willRefundCashManually
        ? {
            refund_status: "manual_pending",
            refund_amount_paise: appointment.cash_collected_amount_paise ?? 0,
          }
        : isLateWithMoneyAtStake
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
