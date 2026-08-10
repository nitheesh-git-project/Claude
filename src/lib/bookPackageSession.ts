import type { createAdminClient } from "@/lib/supabase/admin";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";
import { findTherapistConflict } from "@/lib/checkTherapistConflict";
import { createMeetEventForConfirmedAppointment } from "@/lib/googleCalendarSync";

type AdminClient = ReturnType<typeof createAdminClient>;

// The purchase row shape this needs -- a subset of patient_package_purchases
// plus the two package-level rules (session_duration_minutes,
// therapist_locked) a caller reads once from treatment_category_packages
// and threads through, since the purchase itself only snapshots
// session_count/amount_paid_paise, not the package's other rules.
export type PurchaseForBooking = {
  id: string;
  patient_id: string;
  category_id: string;
  session_count: number;
  sessions_used: number;
  amount_paid_paise: number | null;
  payment_status: string;
  status: string;
  expires_at: string | null;
  locked_therapist_id: string | null;
};

export type BookPackageSessionResult =
  | { success: true; appointmentId: string; assignedTherapistId: string | null }
  | { success: false; status: number; error: string };

/**
 * The one implementation of "claim a session on a paid package, then book
 * it" -- the CAS claim on sessions_used, the per-session amount snapshot,
 * the appointment insert, and the rollback if the insert fails. Originally
 * lived inline in /api/appointments/book-with-package; extracted so every
 * caller that can create a package-backed appointment (that route, the
 * wizard's package-mode checkout booking session 1, the dashboard's bulk
 * scheduler) shares exactly one race-safe implementation instead of three
 * copies that could quietly drift apart.
 *
 * When the purchase already has a locked_therapist_id (see schema.sql's
 * Session Packages v2 section), this auto-assigns that therapist and
 * auto-confirms the session -- payment is already collected, so there is
 * nothing left for an admin to approve. A scheduling conflict on the
 * locked therapist never fails the booking: the session is still created,
 * just unassigned and 'requested', so it lands in the normal admin
 * assignment queue instead of costing the patient their session.
 *
 * Never throws for an expected failure -- every rejection comes back as
 * `{ success: false, status, error }` so callers (a route handler, or the
 * bulk scheduler looping this per slot) can report it without a try/catch
 * around each call.
 */
export async function bookPackageSession(
  admin: AdminClient,
  {
    purchase,
    slotDateTime,
    timezone,
    notes,
    actorId,
    sessionDurationMinutesOverride,
    preferredTherapistId,
  }: {
    purchase: PurchaseForBooking;
    slotDateTime: string;
    timezone?: string | null;
    notes?: string | null;
    // Who to attribute the package_purchase_events row to -- the patient
    // for a self-service booking, an admin's id when they schedule on the
    // patient's behalf.
    actorId: string;
    // treatment_category_packages.session_duration_minutes -- overrides
    // the category's own duration when the package sells a shorter/longer
    // session than the category's default. Caller passes it (rather than
    // this function looking up the package row itself) since callers
    // already have it loaded from their own package fetch.
    sessionDurationMinutesOverride?: number | null;
    // Only meaningful when the purchase isn't already locked to a
    // therapist (session 1, from the booking wizard's "continue with same
    // therapist" picker) -- a hint the admin sees on the assignment queue,
    // same as appointments.preferred_therapist_id on a direct booking.
    // Never auto-assigns; auto-assignment only ever happens from an
    // existing lock, never from a preference.
    preferredTherapistId?: string | null;
  }
): Promise<BookPackageSessionResult> {
  if (purchase.payment_status !== "paid") {
    return { success: false, status: 400, error: "This package hasn't been paid for." };
  }
  if (purchase.status !== "active") {
    return {
      success: false,
      status: 400,
      error:
        purchase.status === "expired"
          ? "This package has expired. Ask the clinic to extend it before scheduling more sessions."
          : "This package is no longer active.",
    };
  }
  if (purchase.expires_at && new Date(purchase.expires_at).getTime() <= Date.now()) {
    return {
      success: false,
      status: 400,
      error: "This package has expired. Ask the clinic to extend it before scheduling more sessions.",
    };
  }
  if (purchase.expires_at && new Date(slotDateTime).getTime() > new Date(purchase.expires_at).getTime()) {
    return {
      success: false,
      status: 400,
      error: "That date is after this package's validity ends. Pick an earlier slot.",
    };
  }
  if (purchase.sessions_used >= purchase.session_count) {
    return { success: false, status: 400, error: "No sessions remaining on this package." };
  }

  // Atomically claim one session: only succeeds if sessions_used still
  // matches what was just read, closing the race where two concurrent
  // requests (two browser tabs, or two slots in the same bulk-schedule
  // batch) both read "1 remaining" and both try to book it.
  const { data: claimed, error: claimError } = await admin
    .from("patient_package_purchases")
    .update({ sessions_used: purchase.sessions_used + 1 })
    .eq("id", purchase.id)
    .eq("sessions_used", purchase.sessions_used)
    .select("id")
    .maybeSingle();

  if (claimError) {
    return { success: false, status: 500, error: claimError.message };
  }
  if (!claimed) {
    return {
      success: false,
      status: 409,
      error: "Could not reserve a package session — please try again.",
    };
  }

  const { data: category } = await admin
    .from("treatment_categories")
    .select("id, title, duration_minutes")
    .eq("id", purchase.category_id)
    .single();

  const durationMinutes =
    sessionDurationMinutesOverride ?? category?.duration_minutes ?? BASE_DURATION_MINUTES;
  const perSessionAmountPaise = purchase.amount_paid_paise
    ? Math.round(purchase.amount_paid_paise / purchase.session_count)
    : 0;

  // Continuity: a locked therapist takes every session on the purchase
  // automatically. Only attempt the assignment if they're actually free
  // for this slot -- findTherapistConflict is the same check
  // /api/admin/assign-appointment runs, so a package session is held to
  // the identical no-double-booking guarantee as a manually assigned one.
  let assignedTherapistId: string | null = null;
  if (purchase.locked_therapist_id) {
    const conflict = await findTherapistConflict(
      admin,
      purchase.locked_therapist_id,
      new Date(slotDateTime).toISOString(),
      durationMinutes
    );
    if (!conflict) {
      assignedTherapistId = purchase.locked_therapist_id;
    }
  }
  // Paid already, and either no lock exists or the locked therapist is
  // confirmed free -- nothing left for an admin to approve.
  const shouldAutoConfirm = !!assignedTherapistId;

  const { data: appointment, error: insertError } = await admin
    .from("appointments")
    .insert({
      patient_id: purchase.patient_id,
      slot_time: new Date(slotDateTime).toISOString(),
      timezone: timezone || null,
      concern: category?.title ?? "General Consultation",
      category_id: purchase.category_id,
      duration_minutes: durationMinutes,
      notes: notes || null,
      status: shouldAutoConfirm ? "confirmed" : "requested",
      therapist_id: assignedTherapistId,
      preferred_therapist_id: assignedTherapistId ? null : preferredTherapistId || null,
      payment_status: "paid",
      amount_paid_paise: perSessionAmountPaise,
      paid_at: new Date().toISOString(),
      package_purchase_id: purchase.id,
    })
    .select("id")
    .single();

  if (insertError || !appointment) {
    // Give the claimed session back — the patient didn't actually get a
    // booking out of it. Re-read the current count and CAS-decrement it
    // (same pattern as the restore in cancelAppointment.ts) rather than
    // blindly overwriting with the pre-claim value, which could clobber a
    // concurrent cancellation/refund on this same package that landed in
    // between the claim above and this rollback.
    const { data: current } = await admin
      .from("patient_package_purchases")
      .select("sessions_used")
      .eq("id", purchase.id)
      .single();
    if (current && current.sessions_used > 0) {
      const { error: revertError } = await admin
        .from("patient_package_purchases")
        .update({ sessions_used: current.sessions_used - 1 })
        .eq("id", purchase.id)
        .eq("sessions_used", current.sessions_used);
      if (revertError) {
        console.error(
          "Failed to revert claimed package session for purchase",
          purchase.id,
          revertError
        );
      }
    }
    return {
      success: false,
      status: 500,
      error: insertError?.message ?? "Could not book this session. Please try again.",
    };
  }

  if (shouldAutoConfirm && assignedTherapistId) {
    // Same call every other paid-and-assigned confirmation path makes
    // (razorpay/verify, admin/assign-appointment, mark-paid-by-cash) --
    // never blocks the booking; a failure is recorded on the appointment
    // and left for the admin's Feature Control retry.
    await createMeetEventForConfirmedAppointment(admin, {
      appointmentId: appointment.id,
      patientId: purchase.patient_id,
      therapistId: assignedTherapistId,
      slotTime: new Date(slotDateTime).toISOString(),
      durationMinutes,
      timezone: timezone || null,
    });
  }

  // Best-effort audit trail -- never lets a logging failure fail a
  // booking that already succeeded.
  try {
    await admin.from("package_purchase_events").insert({
      purchase_id: purchase.id,
      event_type: "session_scheduled",
      actor_id: actorId,
      appointment_id: appointment.id,
      detail: { slotDateTime, assignedTherapistId },
    });
  } catch (eventError) {
    console.error("Failed to log session_scheduled event for purchase", purchase.id, eventError);
  }

  return { success: true, appointmentId: appointment.id, assignedTherapistId };
}
