import type { createAdminClient } from "@/lib/supabase/admin";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";
import { createMeetEventForConfirmedAppointment } from "@/lib/googleCalendarSync";
import { computePerVisitFeePaise } from "@/lib/homeVisitPricing";
import { formatAddressOneLine, type VisitAddress } from "@/lib/formatAddress";
import { mirrorReserve } from "@/lib/sessionCreditMirror";
import { claimTherapistSlot } from "@/lib/claimTherapistSlot";
import { decrementUsedCounter } from "@/lib/purchaseCounter";

type AdminClient = ReturnType<typeof createAdminClient>;

// The purchase row this needs, plus the two package-level rules the purchase
// itself doesn't snapshot (visit duration, therapist lock) which the caller
// reads once from home_visit_packages and threads through -- exactly the
// shape bookPackageSession takes for the online equivalent.
export type HomeVisitPurchaseForBooking = {
  id: string;
  patient_id: string;
  visit_count: number;
  visits_used: number;
  amount_paid_paise: number | null;
  travel_fee_paise: number;
  payment_mode: string;
  payment_status: string;
  status: string;
  expires_at: string | null;
  locked_therapist_id: string | null;
};

// The address a visit is delivered to, snapshotted onto the appointment.
// `id` points back at the live patient_addresses row; every other field is
// frozen at booking time so editing a saved address later can never rewrite
// where a past visit actually happened.
export type HomeVisitAddressInput = VisitAddress & {
  id?: string | null;
  label?: string | null;
  contact_phone?: string | null;
  access_notes?: string | null;
  map_place_id?: string | null;
  area_id?: string | null;
};

/**
 * The message for the one refusal that means "this is already booked". Named
 * rather than inlined because two callers have to recognise it and a string
 * compared in two files is a string that drifts in one of them.
 */
export const DUPLICATE_SLOT_ERROR =
  "This visit is already booked for that time.";

export type BookHomeVisitSessionResult =
  | { success: true; appointmentId: string; assignedTherapistId: string | null }
  | {
      success: false;
      status: number;
      error: string;
      /**
       * The refusal came from the one-per-purchase-per-slot index, so the
       * visit the caller asked for exists. Not an error to report to a
       * patient whose money has already moved.
       */
      duplicate?: boolean;
    };

/**
 * The one implementation of "claim a visit on a home-visit purchase, then
 * book it". Mirrors bookPackageSession() deliberately -- same CAS claim on
 * the counter, same rollback on insert failure, same
 * conflict-never-fails-the-booking rule -- so the two flows stay legible
 * side by side rather than diverging into subtly different race behaviour.
 *
 * Four things differ from the online version, all of them intrinsic to
 * visiting someone's home:
 *
 * 1. **Cash purchases are legitimately unpaid.** A 'cash_on_visit' purchase
 *    books first and collects at the door, so it sits at payment_status
 *    'unpaid' with real confirmed visits hanging off it. The paid-check
 *    therefore applies only to 'prepaid' purchases.
 * 2. **The address is snapshotted** onto the appointment, not just
 *    referenced.
 * 3. **The conflict check is padded** by the travel buffer, because a
 *    therapist finishing at one address cannot be at another minutes later.
 * 4. **The calendar event carries a location instead of a Meet link** -- and
 *    is not optional, since that invite email is the only notification this
 *    platform sends.
 *
 * Never throws for an expected failure; every rejection comes back as
 * `{ success: false, status, error }` so a route handler or a bulk-schedule
 * loop can report it without a try/catch around each call.
 */
export async function bookHomeVisitSession(
  admin: AdminClient,
  {
    purchase,
    slotDateTime,
    timezone,
    notes,
    concern,
    actorId,
    address,
    visitDurationMinutes,
    travelBufferMinutes = 0,
    preferredTherapistId,
  }: {
    purchase: HomeVisitPurchaseForBooking;
    slotDateTime: string;
    timezone?: string | null;
    notes?: string | null;
    concern?: string | null;
    // Who to attribute the home_visit_purchase_events row to -- the patient
    // for a self-service booking, an admin's id when scheduling on their
    // behalf.
    actorId: string;
    address: HomeVisitAddressInput;
    // home_visit_packages.visit_duration_minutes. Passed in rather than
    // looked up here, since callers already have the package row loaded.
    visitDurationMinutes?: number | null;
    // site_settings.home_visit_travel_buffer_minutes. Padding applied on
    // both sides of the slot when checking the locked therapist's calendar.
    travelBufferMinutes?: number;
    // Only meaningful before the purchase is locked to a therapist -- a hint
    // the admin sees on the assignment queue. Never auto-assigns;
    // auto-assignment only ever follows an existing lock.
    preferredTherapistId?: string | null;
  }
): Promise<BookHomeVisitSessionResult> {
  // A prepaid purchase must be settled before anything is scheduled. A
  // cash-on-visit purchase must not be held to that -- being unpaid until
  // the therapist arrives is the whole point of it.
  if (purchase.payment_mode !== "cash_on_visit" && purchase.payment_status !== "paid") {
    return { success: false, status: 400, error: "This home visit package hasn't been paid for." };
  }
  if (purchase.status !== "active") {
    return {
      success: false,
      status: 400,
      error:
        purchase.status === "expired"
          ? "This home visit package has expired. Ask the clinic to extend it before scheduling more visits."
          : "This home visit package is no longer active.",
    };
  }
  if (purchase.expires_at && new Date(purchase.expires_at).getTime() <= Date.now()) {
    return {
      success: false,
      status: 400,
      error:
        "This home visit package has expired. Ask the clinic to extend it before scheduling more visits.",
    };
  }
  if (
    purchase.expires_at &&
    new Date(slotDateTime).getTime() > new Date(purchase.expires_at).getTime()
  ) {
    return {
      success: false,
      status: 400,
      error: "That date is after this package's validity ends. Pick an earlier slot.",
    };
  }
  if (purchase.visits_used >= purchase.visit_count) {
    return { success: false, status: 400, error: "No visits remaining on this package." };
  }
  if (!address?.line1 || !address?.pincode) {
    return {
      success: false,
      status: 400,
      error: "A street address and pincode are required for a home visit.",
    };
  }

  // Atomically claim one visit: only succeeds if visits_used still matches
  // what was just read, closing the race where two concurrent requests (two
  // tabs, or two slots in one bulk-schedule batch) both read "1 remaining"
  // and both try to book it.
  const { data: claimed, error: claimError } = await admin
    .from("home_visit_package_purchases")
    .update({ visits_used: purchase.visits_used + 1 })
    .eq("id", purchase.id)
    .eq("visits_used", purchase.visits_used)
    .select("id")
    .maybeSingle();

  if (claimError) {
    return { success: false, status: 500, error: claimError.message };
  }
  if (!claimed) {
    return {
      success: false,
      status: 409,
      error: "Could not reserve a visit on this package - please try again.",
    };
  }

  const durationMinutes = visitDurationMinutes ?? BASE_DURATION_MINUTES;
  // Travel is tracked separately and paid through to the therapist in full,
  // so it is deliberately NOT part of amount_paid_paise -- see
  // homeVisitPricing.ts.
  const perVisitAmountPaise = computePerVisitFeePaise(
    purchase.amount_paid_paise,
    purchase.visit_count
  );

  // Continuity: a locked therapist takes every visit on the purchase
  // automatically, but only if they are genuinely free for the slot once
  // travel time is accounted for. A conflict never fails the booking -- the
  // visit is still created, just unassigned and 'requested', landing in the
  // admin queue rather than costing the patient a visit.
  // The visit is inserted UNASSIGNED and the locked therapist reserved
  // afterwards through the one atomic claim -- see bookPackageSession for
  // the same correction and the same reasoning. The read-then-insert this
  // replaces could double-book a locked therapist across two visits booked
  // at the same moment, which for a home visit means sending one person to
  // two addresses.
  const isPrepaid = purchase.payment_mode !== "cash_on_visit";

  const { data: appointment, error: insertError } = await admin
    .from("appointments")
    .insert({
      patient_id: purchase.patient_id,
      slot_time: new Date(slotDateTime).toISOString(),
      timezone: timezone || null,
      concern: concern || "Home Physiotherapy Visit",
      duration_minutes: durationMinutes,
      notes: notes || null,
      status: "requested",
      therapist_id: null,
      preferred_therapist_id: preferredTherapistId || null,
      visit_mode: "home_visit",
      home_visit_purchase_id: purchase.id,
      payment_status: isPrepaid ? "paid" : "unpaid",
      payment_method: isPrepaid ? null : "cash",
      amount_paid_paise: isPrepaid ? perVisitAmountPaise : null,
      paid_at: isPrepaid ? new Date().toISOString() : null,
      travel_fee_paise: purchase.travel_fee_paise,
      visit_address_id: address.id || null,
      visit_label: address.label || null,
      visit_address_line1: address.line1,
      visit_address_line2: address.line2 || null,
      visit_landmark: address.landmark || null,
      visit_city: address.city || null,
      visit_state: address.state || null,
      visit_pincode: address.pincode,
      visit_latitude: address.latitude ?? null,
      visit_longitude: address.longitude ?? null,
      visit_map_place_id: address.map_place_id || null,
      visit_contact_phone: address.contact_phone || null,
      visit_access_notes: address.access_notes || null,
      visit_area_id: address.area_id || null,
    })
    .select("id")
    .single();

  if (insertError || !appointment) {
    // Give the claimed visit back -- the patient didn't get a booking out of
    // it. Re-read and CAS-decrement rather than blindly restoring the
    // pre-claim value, which could clobber a concurrent cancellation or
    // refund on this same purchase that landed in between.
    // Retried until it lands (decrementUsedCounter): a single attempt that
    // lost a race, or matched no row, used to leave the credit consumed.
    const reverted = await decrementUsedCounter(
      admin,
      "home_visit_package_purchases",
      "visits_used",
      purchase.id
    );
    if (!reverted.ok) {
      console.error("Failed to revert claimed home visit for purchase", purchase.id, reverted.error);
    }
    // A unique violation here is the one "failure" that is not one: the
    // partial index `appointments_one_per_home_visit_purchase_slot` refuses a
    // second visit on the same purchase at the same instant, which is exactly
    // what a retried verify or a double-tapped Pay produces. The visit the
    // patient wanted exists; the credit has just been given back above, so
    // the balance is right either way. Saying "could not book" here would
    // report a working booking as a failure -- the one thing this route must
    // not do after money has moved.
    if ((insertError as { code?: string } | null)?.code === "23505") {
      return { success: false, duplicate: true, status: 409, error: DUPLICATE_SLOT_ERROR };
    }
    return {
      success: false,
      status: 500,
      error: insertError?.message ?? "Could not book this visit. Please try again.",
    };
  }

  // Reserve the locked therapist, atomically, now that a real appointment
  // id exists to lock against. A prepaid visit with a free locked
  // therapist has nothing left for an admin to approve, so it confirms in
  // the same statement; a cash visit never does -- nobody has paid yet, so
  // the clinic decides whether to send somebody before the patient is
  // committed to anything.
  let assignedTherapistId: string | null = null;
  let shouldAutoConfirm = false;
  if (purchase.locked_therapist_id) {
    const claim = await claimTherapistSlot(admin, {
      appointmentId: appointment.id,
      therapistId: purchase.locked_therapist_id,
      expectUnassigned: true,
      // Travel padding on both sides: a therapist finishing at one address
      // cannot be at another minutes later.
      bufferMinutes: travelBufferMinutes,
      confirm: isPrepaid,
    });
    if (claim.ok) {
      assignedTherapistId = purchase.locked_therapist_id;
      shouldAutoConfirm = isPrepaid;
      await admin
        .from("appointments")
        .update({ preferred_therapist_id: null })
        .eq("id", appointment.id);
    }
    // Refused: the visit is still created, unassigned and `requested`, in
    // the admin's queue. A clash never costs the patient their visit.
  }

  if (shouldAutoConfirm && assignedTherapistId) {
    // A calendar event with the address and no Meet link. Never blocks the
    // booking; a failure is recorded on the appointment and left for the
    // admin's retry, same as every other confirmation path.
    await createMeetEventForConfirmedAppointment(admin, {
      appointmentId: appointment.id,
      patientId: purchase.patient_id,
      therapistId: assignedTherapistId,
      slotTime: new Date(slotDateTime).toISOString(),
      durationMinutes,
      timezone: timezone || null,
      visitMode: "home_visit",
      location: formatAddressOneLine(address),
      description: address.access_notes
        ? `Access notes: ${address.access_notes}`
        : null,
    });
  }

  // Dual-write: the counter claim above is still what the app reads, and
  // this records the same claim in the ledger that will replace it. Never
  // fails the booking -- see sessionCreditMirror.ts. Placed after the
  // appointment insert so the reserve is keyed on a real appointment id,
  // which is also why the rollback path above has nothing to undo.
  await mirrorReserve(admin, {
    appointmentId: appointment.id,
    homeVisitPurchaseId: purchase.id,
    actorId,
    actorRole: actorId === purchase.patient_id ? "patient" : "admin",
  });

  // Best-effort audit trail -- a logging failure must never fail a booking
  // that already succeeded.
  try {
    await admin.from("home_visit_purchase_events").insert({
      purchase_id: purchase.id,
      event_type: "visit_scheduled",
      actor_id: actorId,
      appointment_id: appointment.id,
      detail: { slotDateTime, assignedTherapistId, pincode: address.pincode },
    });
  } catch (eventError) {
    console.error(
      "Failed to log visit_scheduled event for home visit purchase",
      purchase.id,
      eventError
    );
  }

  return { success: true, appointmentId: appointment.id, assignedTherapistId };
}
