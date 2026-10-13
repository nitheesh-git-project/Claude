import type { createAdminClient } from "@/lib/supabase/admin";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";
import { mirrorReserve } from "@/lib/sessionCreditMirror";
import { decrementUsedCounter } from "@/lib/purchaseCounter";

type AdminClient = ReturnType<typeof createAdminClient>;

// The purchase row shape this needs -- a subset of patient_package_purchases.
// The package-level session length is threaded through separately
// (sessionDurationMinutesOverride), since the purchase itself only snapshots
// session_count/amount_paid_paise, not the package's other rules.
// `locked_therapist_id` is carried for callers' own checks; this function no
// longer reads it -- the lock pre-picks the admin's assign, it does not
// assign (see below).
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
  | { success: true; appointmentId: string }
  | {
      success: false;
      status: number;
      error: string;
      /**
       * Refused by `appointments_one_per_package_purchase_slot`, so the
       * session the caller asked for already exists -- a double-submitted
       * bulk schedule or a patient accepting one suggestion twice. Not a
       * failure to report as one; the claimed credit is given back above.
       */
      duplicate?: boolean;
    };

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
 * **Every session it books is `requested` and unassigned, and goes through
 * the admin.** It used to reserve the purchase's locked therapist (or the
 * therapist who suggested the time), confirm the session and make its Meet
 * link on the spot, so a programme session never reached a person. The
 * owner's call: every programme session lands in "Sessions with no
 * therapist", with the programme's therapist pre-picked
 * (`programmeTherapistFor`, src/lib/sessionAssignQueue.ts) and one tap to
 * assign through /api/admin/assign-appointment -- which confirms a paid
 * session and makes the Meet link, exactly as for any other. No slot is held
 * while it waits; the queue row says when the pre-picked therapist is no
 * longer free. It is still paid (`payment_status: 'paid'`): payment was
 * collected with the purchase.
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
    // A hint the admin sees on the assignment queue, same as
    // appointments.preferred_therapist_id on a direct booking (session 1,
    // from the booking wizard's "continue with same therapist" picker).
    // Never assigns -- nothing here does.
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
      error: "Could not reserve a package session - please try again.",
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

  // The session is inserted UNASSIGNED and `requested`, and stays that way
  // until an admin assigns it (see this function's header). Reserving the
  // locked therapist here is what used to put a programme session on a
  // therapist's diary with no person ever looking at it.
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
      status: "requested",
      therapist_id: null,
      preferred_therapist_id: preferredTherapistId || null,
      payment_status: "paid",
      amount_paid_paise: perSessionAmountPaise,
      paid_at: new Date().toISOString(),
      package_purchase_id: purchase.id,
    })
    .select("id")
    .single();

  if (insertError || !appointment) {
    // Nothing to undo in the ledger here: the credit is reserved below,
    // *after* the appointment exists, precisely so the reserve is keyed on
    // a real appointment id. A failed insert means no reserve was ever
    // made.
    //
    // Give the claimed session back - the patient didn't actually get a
    // booking out of it. Re-read the current count and CAS-decrement it
    // (same pattern as the restore in cancelAppointment.ts) rather than
    // blindly overwriting with the pre-claim value, which could clobber a
    // concurrent cancellation/refund on this same package that landed in
    // between the claim above and this rollback.
    // Retried until it lands (decrementUsedCounter): a single attempt that
    // lost a race, or matched no row, used to leave the credit consumed
    // with no session to show for it -- only the error was ever checked.
    const reverted = await decrementUsedCounter(
      admin,
      "patient_package_purchases",
      "sessions_used",
      purchase.id
    );
    if (!reverted.ok) {
      console.error("Failed to revert claimed package session for purchase", purchase.id, reverted.error);
    }
    // trg_appointments_patient_no_overlap: the patient already has another
    // session at this time. The credit has been given back above.
    if ((insertError as { code?: string } | null)?.code === "23P01") {
      return {
        success: false,
        status: 409,
        error: "You already have a session around this time. Pick a different slot.",
      };
    }
    if ((insertError as { code?: string } | null)?.code === "23505") {
      return {
        success: false,
        duplicate: true,
        status: 409,
        error: "This session is already booked for that time.",
      };
    }
    return {
      success: false,
      status: 500,
      error: insertError?.message ?? "Could not book this session. Please try again.",
    };
  }

  // Dual-write: the counter above is still what the app reads, and this
  // records the same claim in the ledger that will replace it. Never fails
  // the booking -- see sessionCreditMirror.ts for why.
  await mirrorReserve(admin, {
    appointmentId: appointment.id,
    packagePurchaseId: purchase.id,
    actorId,
    actorRole: actorId === purchase.patient_id ? "patient" : "admin",
  });

  // Best-effort audit trail -- never lets a logging failure fail a
  // booking that already succeeded.
  try {
    await admin.from("package_purchase_events").insert({
      purchase_id: purchase.id,
      event_type: "session_scheduled",
      actor_id: actorId,
      appointment_id: appointment.id,
      detail: { slotDateTime },
    });
  } catch (eventError) {
    console.error("Failed to log session_scheduled event for purchase", purchase.id, eventError);
  }

  return { success: true, appointmentId: appointment.id };
}
