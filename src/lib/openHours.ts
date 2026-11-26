// Which session start times at least one therapist can actually take.
//
// The booking picker used to offer every hour of the clinic's default day
// (6 AM to midnight, every day), and the only server check before booking
// was the patient's own clashes. Therapist hours were checked only when an
// admin assigned someone -- so a patient could book a Sunday, be told
// "Booking Confirmed", and the clinic found out at Assign & Confirm that
// nobody works Sundays. Now the picker offers an hour only when some
// therapist could be assigned to it, by the very rule assignment uses
// (`assignabilityFromRoster`: on leave, no schedule, not working that hour,
// already booked).
//
// Hours are the clinic's: an open slot is an instant, so a patient picking in
// their own zone sees the same moments the roster is written in.
//
// Dependency-free (the roster comes in as rows), so it is unit-tested.

import { assignabilityReasons, bookingOverlaps } from "@/lib/therapistAssignability";
import { AVAILABILITY_HOURS, computeDayAvailability, type OverrideRow, type TemplateRow } from "@/lib/therapistAvailability";
import { CLINIC_TIMEZONE, zonedSlotMs } from "@/lib/bookingSlots";

export type RosterTherapist = {
  id: string;
  onLeave: boolean;
  leaveFrom?: string | null;
  leaveTo?: string | null;
  template: TemplateRow[];
  overrides: OverrideRow[];
  bookings: { id: string; slot_time: string | null; duration_minutes: number | null; status: string }[];
};

/** "YYYY-MM-DD" plus `n` calendar days. */
export function addDaysToKey(dateKey: string, n: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Every start instant (epoch ms), from `fromDateKey` for `days` clinic days,
 * that at least one therapist could be assigned to for `durationMinutes`.
 * Past instants are left out. Sorted ascending.
 */
export function openSlotStarts(input: {
  fromDateKey: string;
  days: number;
  therapists: RosterTherapist[];
  durationMinutes: number;
  nowMs: number;
}): number[] {
  const open: number[] = [];
  const days = Math.max(0, Math.min(input.days, 120));
  const durationMs = input.durationMinutes * 60_000;
  // Someone on leave can take nothing (the rule's first reason), so they
  // are left out up front rather than asked 2,000 times.
  const working = input.therapists.filter((t) => !t.onLeave);
  for (let i = 0; i < days; i++) {
    const dateKey = addDaysToKey(input.fromDateKey, i);
    // Each therapist's day, worked out once per date rather than once per
    // hour: this loop asks up to 120 days x 18 hours per therapist, and
    // redoing the day (and two time-zone conversions and a date label) for
    // every one of those made the picker wait seconds for its answer.
    const dayByTherapist = working.map((t) => computeDayAvailability(dateKey, t.template, t.overrides));
    const startOf = dayHourStarts(dateKey);
    for (const hour of AVAILABILITY_HOURS) {
      const ms = startOf(hour);
      if (ms === null || ms <= input.nowMs) continue;
      // The very judgement Assign & Confirm makes (assignabilityReasons via
      // assignabilityFromRoster), fed the same facts. The slot's clinic date
      // and hour are this loop's own, and the labels are left empty because
      // only whether a reason exists matters here, never its wording.
      const someoneFree = working.some(
        (t, n) =>
          assignabilityReasons({
            onLeave: false,
            weeklyHourCount: t.template.length,
            slotState: dayByTherapist[n][hour] ?? null,
            hourLabel: "",
            dateLabel: "",
            alreadyBooked: bookingOverlaps(t.bookings, ms, ms + durationMs),
          }).length === 0
      );
      if (someoneFree) open.push(ms);
    }
  }
  return open;
}

/**
 * Each hour's start instant on a clinic date. A time-zone conversion costs
 * about a fifth of a millisecond and the picker asks for 2,000 of them, which
 * was most of its wait; so the day's first and last hours are converted and
 * the hours between are counted from the first -- exact whenever the zone's
 * offset holds all day, which the two ends prove. A day where it does not
 * (a clock change, never in India) converts every hour, as before.
 */
function dayHourStarts(dateKey: string): (hour: number) => number | null {
  const first = AVAILABILITY_HOURS[0];
  const last = AVAILABILITY_HOURS[AVAILABILITY_HOURS.length - 1];
  const firstMs = zonedSlotMs(dateKey, first, CLINIC_TIMEZONE);
  const lastMs = zonedSlotMs(dateKey, last, CLINIC_TIMEZONE);
  if (firstMs !== null && lastMs !== null && lastMs - firstMs === (last - first) * 3_600_000) {
    return (hour) => firstMs + (hour - first) * 3_600_000;
  }
  return (hour) => zonedSlotMs(dateKey, hour, CLINIC_TIMEZONE);
}

/** A lookup the pickers can ask per slot. Null means "could not be checked",
 *  which offers every hour, as the picker did before this existed. */
export function openSlotPredicate(openStarts: number[] | null): ((ms: number) => boolean) | null {
  if (!openStarts) return null;
  const set = new Set(openStarts);
  return (ms: number) => set.has(ms);
}
