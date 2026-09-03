// Turning a paid booking into a confirmed session.
//
// Two routes reach this point and they must not drift: `/api/razorpay/verify`
// after a real capture, and `/api/appointments/confirm-free` when a discount
// took the price to nothing and no gateway was involved at all. The sequence
// is identical either way -- read the roster, claim the row, create the Meet
// event -- and the only difference is whether there is a payment id to
// record. A rule that lives in two routes becomes two rules.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  pickAutoAssignTherapist,
  readAutoAssignSettings,
} from "@/lib/autoAssignTherapist";
import { createMeetEventForConfirmedAppointment } from "@/lib/googleCalendarSync";

type AdminClient = SupabaseClient;

export type ConfirmableAppointment = {
  id: string;
  patient_id: string;
  therapist_id: string | null;
  status: string;
  slot_time: string | null;
  duration_minutes: number | null;
  timezone: string | null;
  visit_mode: string | null;
  preferred_therapist_id: string | null;
};

export type ConfirmResult = {
  /** False when the row moved out from under the claim -- almost always a
   *  cancellation between checkout and this call. */
  claimed: boolean;
  /** Set when the write itself failed, as opposed to losing the claim. */
  error: string | null;
  assignedTherapistId: string | null;
  autoConfirmed: boolean;
};

export async function confirmPaidAppointment(
  admin: AdminClient,
  args: {
    appointment: ConfirmableAppointment;
    /** Null for a booking that never went to a gateway. */
    razorpayPaymentId?: string | null;
    /** Written only when given, so the paid path keeps the figure
     *  create-order already resolved rather than re-deriving it. */
    amountPaidPaise?: number | null;
    /** Extra columns to write inside the same claim, so a discount fact can
     *  never be recorded against a booking whose claim was lost. */
    extraFields?: Record<string, unknown>;
  }
): Promise<ConfirmResult> {
  const { appointment } = args;

  // A therapist already being assigned means everything else was already
  // arranged (e.g. a hospital referral) -- payment was the only thing
  // pending. When nobody is assigned yet, the roster is asked whether the
  // answer is unambiguous: exactly one approved, active, not-on-leave
  // therapist who works that hour with no clashing session. Anything less
  // certain returns null and the appointment stays in the admin's queue --
  // see autoAssignTherapist.ts for why the tie-break is deliberately "don't".
  let assignedTherapistId = appointment.therapist_id;
  let autoAssignReason: string | null = null;
  if (!assignedTherapistId && appointment.status === "requested" && appointment.slot_time) {
    const settings = await readAutoAssignSettings(admin);
    const picked = await pickAutoAssignTherapist(admin, {
      appointmentId: appointment.id,
      slotTime: appointment.slot_time,
      durationMinutes: appointment.duration_minutes,
      preferredTherapistId: appointment.preferred_therapist_id,
      visitMode: appointment.visit_mode,
      travelBufferMinutes: settings.travelBufferMinutes,
    });
    if (picked) {
      assignedTherapistId = picked.therapistId;
      autoAssignReason = picked.reason;
    }
  }

  const shouldAutoConfirm = Boolean(assignedTherapistId) && appointment.status === "requested";

  // Atomic claim: only confirm/mark-paid if the appointment is still in the
  // same active state it was read in. Without this, an admin cancelling in
  // the moment between checkout succeeding and this call landing would let
  // the write through anyway -- either resurrecting a cancelled booking or
  // marking a cancelled (possibly already-refunded) one paid.
  const { data: claimed, error: claimError } = await admin
    .from("appointments")
    .update({
      payment_status: "paid",
      paid_at: new Date().toISOString(),
      ...(args.razorpayPaymentId ? { razorpay_payment_id: args.razorpayPaymentId } : {}),
      ...(typeof args.amountPaidPaise === "number"
        ? { amount_paid_paise: args.amountPaidPaise }
        : {}),
      ...(args.extraFields ?? {}),
      ...(shouldAutoConfirm
        ? {
            status: "confirmed",
            // Written in the same claim as the confirmation, so a session
            // can never be confirmed with nobody on it.
            ...(autoAssignReason ? { therapist_id: assignedTherapistId } : {}),
          }
        : {}),
    })
    .eq("id", appointment.id)
    .in("status", ["requested", "confirmed"])
    .select("id")
    .maybeSingle();

  if (claimError) {
    return {
      claimed: false,
      error: claimError.message,
      assignedTherapistId,
      autoConfirmed: false,
    };
  }
  if (!claimed) {
    return { claimed: false, error: null, assignedTherapistId, autoConfirmed: false };
  }

  // The claim above already applied shouldAutoConfirm inside the same write,
  // so if it succeeded the status change actually stuck and it is safe to
  // create the Meet event now.
  if (shouldAutoConfirm && assignedTherapistId && appointment.slot_time) {
    await createMeetEventForConfirmedAppointment(admin, {
      appointmentId: appointment.id,
      patientId: appointment.patient_id,
      therapistId: assignedTherapistId,
      slotTime: appointment.slot_time,
      durationMinutes: appointment.duration_minutes,
      timezone: appointment.timezone,
    });
  }

  return { claimed: true, error: null, assignedTherapistId, autoConfirmed: shouldAutoConfirm };
}
