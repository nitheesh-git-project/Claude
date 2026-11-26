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

import { assignabilityFromRoster } from "@/lib/therapistAssignability";
import { AVAILABILITY_HOURS, type OverrideRow, type TemplateRow } from "@/lib/therapistAvailability";
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
  for (let i = 0; i < days; i++) {
    const dateKey = addDaysToKey(input.fromDateKey, i);
    for (const hour of AVAILABILITY_HOURS) {
      const ms = zonedSlotMs(dateKey, hour, CLINIC_TIMEZONE);
      if (ms === null || ms <= input.nowMs) continue;
      const slotTime = new Date(ms).toISOString();
      const someoneFree = input.therapists.some(
        (t) =>
          assignabilityFromRoster({
            slotTime,
            durationMinutes: input.durationMinutes,
            onLeave: t.onLeave,
            leaveFrom: t.leaveFrom,
            leaveTo: t.leaveTo,
            template: t.template,
            overrides: t.overrides,
            bookings: t.bookings,
          }).length === 0
      );
      if (someoneFree) open.push(ms);
    }
  }
  return open;
}

/** A lookup the pickers can ask per slot. Null means "could not be checked",
 *  which offers every hour, as the picker did before this existed. */
export function openSlotPredicate(openStarts: number[] | null): ((ms: number) => boolean) | null {
  if (!openStarts) return null;
  const set = new Set(openStarts);
  return (ms: number) => set.has(ms);
}
