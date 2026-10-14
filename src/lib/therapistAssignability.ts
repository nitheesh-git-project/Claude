// Whether an admin may put a therapist on a session at a given time, and if
// not, every reason why -- said in the "Unable to assign this therapist"
// dialog. A hard rule for a person as well as for the machine (it used to be
// advice only for an admin; see docs/rules/roster.md): a session given to
// somebody who is not working that hour is a session nobody turns up to.
//
// `assignabilityReasons` is the judgement with the database taken out, so it
// is unit-tested; `checkTherapistAssignable` reads the roster for it.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AVAILABILITY_HOURS,
  computeDayAvailability,
  formatHourRange,
  type OverrideRow,
  type SlotState,
  type TemplateRow,
} from "@/lib/therapistAvailability";
import { clinicDateKey, clinicHour } from "@/lib/clinicWeek";
import { findTherapistConflict } from "@/lib/checkTherapistConflict";
import { formatClinicDate } from "@/lib/formatDateTime";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";

export type AssignBlockCode = "on_leave" | "no_schedule" | "not_working_that_hour" | "already_booked";

export type AssignBlock = { code: AssignBlockCode; message: string };

export function assignabilityReasons(input: {
  onLeave: boolean;
  leaveFrom?: string | null;
  leaveTo?: string | null;
  /** Hours on the therapist's weekly schedule at all. */
  weeklyHourCount: number;
  /** That hour's state on that date, or null when outside bookable hours. */
  slotState: SlotState | null;
  hourLabel: string;
  dateLabel: string;
  alreadyBooked: boolean;
}): AssignBlock[] {
  const reasons: AssignBlock[] = [];
  if (input.onLeave) {
    const span =
      input.leaveFrom || input.leaveTo
        ? ` (${input.leaveFrom ? formatClinicDate(input.leaveFrom) : "until further notice"}${
            input.leaveTo ? ` to ${formatClinicDate(input.leaveTo)}` : ""
          })`
        : "";
    reasons.push({ code: "on_leave", message: `On leave${span}.` });
  }
  if (input.weeklyHourCount === 0 && input.slotState !== "override_available") {
    reasons.push({ code: "no_schedule", message: "Has not filled in a working schedule yet." });
  } else if (input.slotState !== "available" && input.slotState !== "override_available") {
    reasons.push({
      code: "not_working_that_hour",
      message: `Not working ${input.hourLabel} on ${input.dateLabel}.`,
    });
  }
  if (input.alreadyBooked) {
    reasons.push({
      code: "already_booked",
      message: `Already has a session at ${input.hourLabel} on ${input.dateLabel}.`,
    });
  }
  return reasons;
}

/**
 * The same judgement as `checkTherapistAssignable`, over rows a screen has
 * already loaded rather than a fresh read -- the admin dashboard has the
 * whole roster, every leave flag and every session in hand. It is what the
 * "Sessions with no therapist" queue uses to say a programme session's
 * pre-picked therapist "is no longer free at this time" instead of offering
 * a one-tap assign that would come back 409: nothing is held for them while
 * the session waits (docs/rules/programmes.md). Advisory only -- the assign
 * route re-reads the roster and is the authority.
 *
 * Bookings are matched the way `findTherapistConflict` matches them: any of
 * the therapist's non-cancelled sessions overlapping the slot (padded by
 * `bufferMinutes` for a home visit), excluding the session being assigned.
 */
export function assignabilityFromRoster(input: {
  slotTime: string;
  durationMinutes: number | null;
  bufferMinutes?: number;
  excludeAppointmentId?: string;
  onLeave: boolean;
  leaveFrom?: string | null;
  leaveTo?: string | null;
  /** This therapist's weekly template rows. */
  template: TemplateRow[];
  /** This therapist's one-off exceptions (any dates; the slot's is picked). */
  overrides: OverrideRow[];
  /** This therapist's sessions. */
  bookings: { id: string; slot_time: string | null; duration_minutes: number | null; status: string }[];
}): AssignBlock[] {
  const slotMs = new Date(input.slotTime).getTime();
  if (Number.isNaN(slotMs)) return [];
  const dateKey = clinicDateKey(slotMs);
  const hour = clinicHour(slotMs);
  const slotState = AVAILABILITY_HOURS.includes(hour)
    ? computeDayAvailability(dateKey, input.template, input.overrides)[hour] ?? null
    : null;
  const bufferMs = Math.max(0, input.bufferMinutes ?? 0) * 60_000;
  const start = slotMs - bufferMs;
  const end = slotMs + (input.durationMinutes ?? BASE_DURATION_MINUTES) * 60_000 + bufferMs;
  const alreadyBooked = input.bookings.some((b) => {
    if (b.id === input.excludeAppointmentId || b.status === "cancelled" || !b.slot_time) return false;
    const otherStart = new Date(b.slot_time).getTime();
    const otherEnd = otherStart + (b.duration_minutes ?? BASE_DURATION_MINUTES) * 60_000;
    return start < otherEnd && otherStart < end;
  });
  return assignabilityReasons({
    onLeave: input.onLeave,
    leaveFrom: input.leaveFrom,
    leaveTo: input.leaveTo,
    weeklyHourCount: input.template.length,
    slotState,
    hourLabel: formatHourRange(hour),
    dateLabel: formatClinicDate(input.slotTime),
    alreadyBooked,
  });
}

export type AssignabilityResult =
  | { ok: true }
  | { ok: false; reasons: AssignBlock[] }
  | { ok: null }; // the roster could not be read: "try again", never "free"

export async function checkTherapistAssignable(
  admin: SupabaseClient,
  therapistId: string,
  slotTime: string,
  durationMinutes: number,
  options: { excludeAppointmentId?: string; excludeReferralId?: string; bufferMinutes?: number } = {}
): Promise<AssignabilityResult> {
  try {
    const slotMs = new Date(slotTime).getTime();
    if (Number.isNaN(slotMs)) return { ok: null };
    const dateKey = clinicDateKey(slotMs);
    const hour = clinicHour(slotMs);

    const [profileRes, templateRes, overrideRes] = await Promise.all([
      admin
        .from("profiles")
        .select("on_leave, on_leave_from, on_leave_to")
        .eq("id", therapistId)
        .maybeSingle(),
      admin.from("therapist_availability_template").select("day_of_week, hour").eq("therapist_id", therapistId),
      admin
        .from("therapist_availability_override")
        .select("date, hour, available")
        .eq("therapist_id", therapistId)
        .eq("date", dateKey),
    ]);
    if (profileRes.error || templateRes.error || overrideRes.error || !profileRes.data) return { ok: null };

    const template = templateRes.data ?? [];
    const slotState = AVAILABILITY_HOURS.includes(hour)
      ? computeDayAvailability(dateKey, template, overrideRes.data ?? [])[hour] ?? null
      : null;
    const alreadyBooked = await findTherapistConflict(admin, therapistId, slotTime, durationMinutes, options);

    const reasons = assignabilityReasons({
      onLeave: profileRes.data.on_leave === true,
      leaveFrom: profileRes.data.on_leave_from,
      leaveTo: profileRes.data.on_leave_to,
      weeklyHourCount: template.length,
      slotState,
      hourLabel: formatHourRange(hour),
      dateLabel: formatClinicDate(slotTime),
      alreadyBooked,
    });
    return reasons.length ? { ok: false, reasons } : { ok: true };
  } catch (err) {
    console.error("checkTherapistAssignable failed", therapistId, err);
    return { ok: null };
  }
}

/** The 409 body every assign route sends, so the dialog reads one shape. */
export function unassignableBody(reasons: AssignBlock[]) {
  return { error: "Unable to assign this therapist.", code: "therapist_unavailable", reasons };
}
