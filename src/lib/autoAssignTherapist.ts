import type { SupabaseClient } from "@supabase/supabase-js";

import { AVAILABILITY_HOURS, computeDayAvailability } from "@/lib/therapistAvailability";
import { findTherapistConflict } from "@/lib/checkTherapistConflict";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";
import { toDateKey } from "@/lib/bookingSlots";

/**
 * Assigns a therapist to a freshly paid session, when exactly one is
 * unambiguously free for it.
 *
 * The gap this closes. A patient picked a time, paid, and then waited: the
 * appointment sat `requested` with `therapist_id` null until an admin opened
 * the dashboard and assigned somebody. Only then did it become `confirmed`,
 * only then did a Meet link exist, and only then could the therapist see it.
 * The wait was bounded by nothing except how soon a person next opened a
 * browser -- overnight and at weekends, hours -- and what the patient saw in
 * the meantime, immediately after paying, was "Requested" with no clinician
 * named.
 *
 * Every part of the answer already existed: the roster says who works when,
 * `findTherapistConflict` says who is already booked, and
 * `bookPackageSession` has assigned-and-confirmed without an admin since
 * packages were built. This is those three wired together for the one case
 * they did not cover.
 *
 * **This is not the roster filtering the patient's picker.** That separation
 * is deliberate and stays: `/book` still offers every slot that clears the
 * lead time, because constraining what a patient may *ask for* is a
 * different and worse product. The roster's own job -- the clinic's record
 * of who can be *offered* a session -- is exactly what is being read here.
 *
 * Four rules keep it conservative:
 *
 * 1. **Silence is the fallback, never a wrong assignment.** Zero candidates
 *    or more than one and it returns null, leaving the appointment exactly
 *    where it was: `requested`, unassigned, in the admin's queue. Assigning
 *    the wrong clinician is far worse than the wait this removes, so the
 *    tie-break is deliberately "don't".
 * 2. **A patient's request wins.** If the booking carries a
 *    `preferred_therapist_id` -- from `/team`'s "Book with ...", or the
 *    "same therapist again" dropdown -- and that therapist is eligible and
 *    free, they are chosen even if others are also free. Anything else
 *    would quietly overrule the one preference the patient expressed.
 * 3. **It never throws.** Every failure path returns null. This runs inside
 *    payment confirmation, and a booking must never fail because an
 *    optional convenience could not be computed.
 * 4. **It is one admin switch.** `site_settings.auto_assign_therapist_enabled`,
 *    read in its own call and failing *closed* -- an unreadable setting
 *    leaves the appointment in the queue, which is the pre-existing
 *    behaviour and therefore the safe answer.
 */

export type AutoAssignInput = {
  appointmentId: string;
  slotTime: string;
  durationMinutes: number | null;
  /** Honoured when that therapist is eligible and free -- see rule 2. */
  preferredTherapistId?: string | null;
  /** 'home_visit' pads the conflict check on both sides; online passes 0. */
  visitMode?: string | null;
  /** `site_settings.home_visit_travel_buffer_minutes`, for a home visit. */
  travelBufferMinutes?: number;
};

export type AutoAssignResult = {
  therapistId: string;
  /** Why this therapist, for the audit trail and for the admin's screen. */
  reason: "preferred" | "only_candidate";
};

type TherapistRow = { id: string };

export type AutoAssignSettings = {
  enabled: boolean;
  /** Padding applied on both sides of a home visit's conflict check. */
  travelBufferMinutes: number;
};

const AUTO_ASSIGN_OFF: AutoAssignSettings = { enabled: false, travelBufferMinutes: 0 };

/**
 * Read in its own call, and failing **closed**: these columns are newer
 * than most, and a database that has not applied the migration must behave
 * exactly as it did before the feature existed rather than start assigning.
 * That is the opposite default from `contact_scan_mode`, and deliberately
 * so -- the safe answer to "I don't know" is different for a control that
 * blocks writes and one that takes an action on somebody's behalf.
 */
export async function readAutoAssignSettings(
  admin: SupabaseClient
): Promise<AutoAssignSettings> {
  try {
    const { data, error } = await admin
      .from("site_settings")
      .select("auto_assign_therapist_enabled, home_visit_travel_buffer_minutes")
      .maybeSingle();
    if (error || !data) return AUTO_ASSIGN_OFF;
    return {
      enabled: data.auto_assign_therapist_enabled === true,
      travelBufferMinutes:
        typeof data.home_visit_travel_buffer_minutes === "number"
          ? data.home_visit_travel_buffer_minutes
          : 0,
    };
  } catch {
    return AUTO_ASSIGN_OFF;
  }
}

/**
 * Returns the therapist to assign, or null to leave the session in the
 * admin's queue. Never throws.
 */
export async function pickAutoAssignTherapist(
  admin: SupabaseClient,
  input: AutoAssignInput
): Promise<AutoAssignResult | null> {
  try {
    if (!(await readAutoAssignSettings(admin)).enabled) return null;

    const slotMs = new Date(input.slotTime).getTime();
    if (Number.isNaN(slotMs)) return null;

    const duration = input.durationMinutes ?? BASE_DURATION_MINUTES;
    const isHomeVisit = input.visitMode === "home_visit";
    const bufferMinutes = isHomeVisit ? Math.max(0, input.travelBufferMinutes ?? 0) : 0;

    // The hour the roster is keyed by, read in the same local terms the
    // roster itself uses -- see therapistAvailability.ts on why a date key
    // needs no timezone conversion.
    const slotDate = new Date(slotMs);
    const dateKey = toDateKey(slotDate);
    const hour = slotDate.getHours();
    if (!AVAILABILITY_HOURS.includes(hour)) return null;

    // Eligible at all: an approved, active therapist who is not on leave.
    // Exactly the set an admin's own assign form offers.
    const { data: therapists, error: therapistError } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "therapist")
      .eq("approved", true)
      .eq("active", true)
      .or("on_leave.is.null,on_leave.eq.false");
    if (therapistError || !therapists?.length) return null;

    const ids = (therapists as TherapistRow[]).map((t) => t.id);

    // The roster, for this one date. Both tables are read in one pass
    // rather than per therapist: the candidate list is the whole clinic,
    // and this runs inside a payment confirmation.
    const [{ data: templateRows }, { data: overrideRows }] = await Promise.all([
      admin
        .from("therapist_availability_template")
        .select("therapist_id, day_of_week, hour")
        .in("therapist_id", ids),
      admin
        .from("therapist_availability_override")
        .select("therapist_id, date, hour, available")
        .in("therapist_id", ids)
        .eq("date", dateKey),
    ]);

    const rostered = ids.filter((id) => {
      const template = (templateRows ?? [])
        .filter((r) => r.therapist_id === id)
        .map((r) => ({ day_of_week: r.day_of_week, hour: r.hour }));
      const overrides = (overrideRows ?? [])
        .filter((r) => r.therapist_id === id)
        .map((r) => ({ date: r.date, hour: r.hour, available: r.available }));
      const state = computeDayAvailability(dateKey, template, overrides)[hour];
      return state === "available" || state === "override_available";
    });
    if (!rostered.length) return null;

    // Who among them is already booked. Sequential rather than parallel:
    // the common case is a small clinic, and each check is a query.
    const busy: string[] = [];
    for (const id of rostered) {
      const clash = await findTherapistConflict(admin, id, input.slotTime, duration, {
        excludeAppointmentId: input.appointmentId,
        bufferMinutes,
      });
      if (clash) busy.push(id);
    }

    // One decision, shared with decideAutoAssignment's tests -- so the rule
    // that runs in production is the rule that is covered.
    return decideAutoAssignment({
      rostered,
      busy,
      preferredTherapistId: input.preferredTherapistId,
    });
  } catch (err) {
    // Never fail a payment for this.
    console.error("Auto-assign failed for appointment", input.appointmentId, err);
    return null;
  }
}

/**
 * The decision, with the database taken out of it: given who is rostered
 * and who is busy, which therapist (if any) should take this session.
 *
 * Split out so the rule that actually carries the product judgement --
 * "a stated preference wins, otherwise only an unambiguous answer counts"
 * -- can be tested without a Supabase project, which is the same reason
 * the money and roster maths live in dependency-free modules.
 */
export function decideAutoAssignment({
  rostered,
  busy,
  preferredTherapistId,
}: {
  /** Therapists eligible and working that hour. */
  rostered: string[];
  /** Of those, the ones with a clashing session. */
  busy: string[];
  preferredTherapistId?: string | null;
}): AutoAssignResult | null {
  const busySet = new Set(busy);
  const preferred = preferredTherapistId?.trim() || null;

  // Rule 2: the patient asked for someone. If they are eligible and free
  // they take it, even when colleagues are also free -- anything else
  // quietly overrules the one preference the patient expressed.
  if (preferred && rostered.includes(preferred) && !busySet.has(preferred)) {
    return { therapistId: preferred, reason: "preferred" };
  }

  // Rule 1: otherwise only an unambiguous answer counts. Zero is nobody to
  // assign; two or more is a choice for a person, and the queue is where
  // that choice already gets made.
  const free = rostered.filter((id) => !busySet.has(id));
  if (free.length !== 1) return null;
  return { therapistId: free[0], reason: "only_candidate" };
}
