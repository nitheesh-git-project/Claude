// Turning a booking into a confirmed session.
//
// Three routes reach this point and they must not drift: `/api/razorpay/verify`
// after a real capture, `/api/appointments/confirm-free` when a discount took
// the price to nothing and no gateway was involved at all, and
// `/api/appointments/confirm-pay-later` for a trusted patient who will settle
// afterwards. The sequence is identical for all three -- read the roster,
// claim the row, create the Meet event -- and the only difference is which
// payment columns the claim writes. A rule that lives in three routes becomes
// three rules.
//
// The split is by what the write MEANS, not by a flag. A `markPaid: false`
// argument was rejected: `confirmPaidAppointment(..., { markPaid: false })`
// reads as a lie at the call site, and the two callers genuinely want
// different columns rather than the same write with one field suppressed.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  pickAutoAssignTherapist,
  readAutoAssignSettings,
} from "@/lib/autoAssignTherapist";
import { createMeetEventForConfirmedAppointment } from "@/lib/googleCalendarSync";
import { claimTherapistSlot } from "@/lib/claimTherapistSlot";

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
  /**
   * Why the auto-assigner picked who it picked, or null when it did not
   * pick (nobody free, more than one free, or an admin got there first).
   * Returned rather than discarded: this is the one decision in the booking
   * flow that nobody made by hand, so "the only therapist free that hour"
   * versus "the therapist the patient asked for" is the difference between
   * an assignment an admin will leave alone and one they will want to look
   * at.
   */
  autoAssignReason: string | null;
};

/**
 * The sequence, with the payment columns handed in.
 *
 * Private on purpose: the two exports below name what they mean, and a
 * caller reaching this directly could confirm a session while writing
 * whatever it liked to the columns that decide whether money is owed.
 */
async function runConfirmation(
  admin: AdminClient,
  args: {
    appointment: ConfirmableAppointment;
    /** Everything the claim writes about money, resolved by the caller. */
    paymentFields: Record<string, unknown>;
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
      // Reserved through the one atomic claim rather than written as a
      // field on the payment update below.
      //
      // That update compare-and-sets on `status` and never on
      // `therapist_id`, and an admin assigning by hand leaves the status at
      // `requested` -- which is exactly the window this runs in. So an
      // admin who picked a therapist in the moments between checkout
      // starting and the payment landing had their choice silently
      // overwritten by the auto-assigner, and the session went out with a
      // calendar invite naming somebody the admin had not chosen.
      //
      // `expectUnassigned` is what refuses that: the reservation only
      // applies while nobody is on the session. If an admin got there
      // first, the claim is refused, their therapist stands, and the
      // booking simply confirms with the person they picked.
      const claim = await claimTherapistSlot(admin, {
        appointmentId: appointment.id,
        therapistId: picked.therapistId,
        expectUnassigned: true,
        bufferMinutes: settings.travelBufferMinutes,
      });
      if (claim.ok) {
        assignedTherapistId = picked.therapistId;
        autoAssignReason = picked.reason;
      } else if (claim.reason === "reassigned") {
        // Somebody assigned this session while we were deciding. Re-read
        // who, so the confirmation below still names the right person on
        // the calendar invite rather than leaving it unassigned.
        assignedTherapistId = claim.currentTherapistId ?? appointment.therapist_id;
      }
      // Any other refusal (a clash that appeared, or a reservation we could
      // not make) leaves the session unassigned in the admin's queue --
      // which is the documented fallback and exactly what happened before
      // auto-assignment existed. A payment is never failed for it.
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
      ...args.paymentFields,
      ...(args.extraFields ?? {}),
      // `therapist_id` is deliberately NOT written here any more -- the
      // reservation above already wrote it, atomically, under a lock. A
      // session still cannot be confirmed with nobody on it, because
      // `shouldAutoConfirm` is false unless somebody is.
      ...(shouldAutoConfirm ? { status: "confirmed" } : {}),
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
      autoAssignReason,
    };
  }
  if (!claimed) {
    return {
      claimed: false,
      error: null,
      assignedTherapistId,
      autoConfirmed: false,
      autoAssignReason,
    };
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

  return {
    claimed: true,
    error: null,
    assignedTherapistId,
    autoConfirmed: shouldAutoConfirm,
    autoAssignReason,
  };
}

/**
 * A booking that has been paid for, by a gateway or by a discount reaching
 * zero. Its exported shape is unchanged -- the three existing callers pass
 * exactly what they always did.
 */
export async function confirmPaidAppointment(
  admin: AdminClient,
  args: {
    appointment: ConfirmableAppointment;
    /** Null for a booking that never went to a gateway. */
    razorpayPaymentId?: string | null;
    /** Written only when given, so the paid path keeps the figure
     *  create-order already resolved rather than re-deriving it. */
    amountPaidPaise?: number | null;
    extraFields?: Record<string, unknown>;
  }
): Promise<ConfirmResult> {
  return runConfirmation(admin, {
    appointment: args.appointment,
    paymentFields: {
      payment_status: "paid",
      paid_at: new Date().toISOString(),
      ...(args.razorpayPaymentId ? { razorpay_payment_id: args.razorpayPaymentId } : {}),
      ...(typeof args.amountPaidPaise === "number"
        ? { amount_paid_paise: args.amountPaidPaise }
        : {}),
    },
    extraFields: args.extraFields,
  });
}

/**
 * A booking a trusted patient will settle afterwards.
 *
 * Everything the paid path does -- the roster's auto-assignment, the atomic
 * claim, the Meet event -- and **none** of what it writes about money. Three
 * things are load-bearing:
 *
 * 1. **`payment_status` stays `unpaid`, and `paid_at` is never stamped.**
 *    That is the whole reason `payment_terms` exists as a second axis: this
 *    row and an abandoned checkout carry the same `unpaid`, and only the
 *    terms tell them apart.
 * 2. **The price is frozen here, inside the same claim that confirms.** All
 *    of it lands or none does, so there is no moment where a row is marked
 *    pay-later but unconfirmed, or confirmed with no figure on it. Freezing
 *    matters because `checkoutQuote` reads the LIVE category price -- resolve
 *    it again at settlement and the patient is charged the new price for work
 *    already delivered.
 * 3. **Nothing is owed yet.** `amount_due_paise` is stamped now and counted
 *    only once the session is `completed`, which is what makes "booking owes
 *    nothing" and "a late cancellation owes nothing" true with no special
 *    case anywhere.
 */
export async function confirmPayLaterAppointment(
  admin: AdminClient,
  args: {
    appointment: ConfirmableAppointment;
    /** What this session will cost when it has been delivered. */
    amountDuePaise: number;
    extraFields?: Record<string, unknown>;
  }
): Promise<ConfirmResult> {
  return runConfirmation(admin, {
    appointment: args.appointment,
    paymentFields: {
      payment_terms: "pay_later",
      amount_due_paise: args.amountDuePaise,
    },
    extraFields: args.extraFields,
  });
}
