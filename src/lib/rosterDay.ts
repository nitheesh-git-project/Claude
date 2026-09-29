// One date, every therapist: who is working, and which of their hours are
// already taken.
//
// The roster answers "what does this therapist normally work" very well and
// could not answer "who is free on Thursday" at all -- an admin taking a call
// had to open each therapist in turn and hold the answer in their head. The
// data was all there; nothing joined it. The only code in the app that joined
// the roster to the bookings at all is `pickAutoAssignTherapist`, and that
// answers for **one instant**, not a day.
//
// Dependency-free and unit-tested, like every other judgement in `src/lib`.
// The route feeds it rows and renders what it returns; nothing here reads a
// database, a clock or a browser.
//
// Three rules are load-bearing:
//
// 1. **It composes `computeDayAvailability` rather than re-deriving
//    availability.** That function is the one place the template-plus-override
//    precedence lives, and a second copy here would be a second answer to
//    which hours a therapist works -- the exact failure the roster redesign
//    corrected one layer down.
// 2. **An hour is busy when a session *overlaps* it, not when it starts on
//    it.** A 90-minute session at 2 PM takes 3 PM with it. Judged from each
//    appointment's own `durationMinutes`, the same way
//    `checkTherapistConflict` does -- comparing start times alone is how a
//    screen offers a slot the booking route then refuses.
// 3. **Leave beats the roster, and the roster beats nothing.** `on_leave` is
//    the only flag that takes somebody off the board (the leave *dates* are
//    annotation -- see the roster rule in AGENTS.md), and an hour outside the
//    working ranges is `off` rather than absent, so the strip reads as a day
//    rather than as a list of the hours that happened to survive.

import { AVAILABILITY_HOURS, computeDayAvailability } from "@/lib/therapistAvailability";
import type { OverrideRow, TemplateRow } from "@/lib/therapistAvailability";
import { zonedDayAndHour } from "@/lib/availabilityRanges";

/** Long enough that a missing duration cannot silently free an hour. Matches
 *  the base duration the conflict check falls back to. */
export const DEFAULT_SESSION_MINUTES = 60;

export type RosterDayAppointment = {
  id: string;
  therapistId: string | null;
  slotTime: string | null;
  durationMinutes: number | null;
  status: string | null;
  /** Who it is with, already resolved -- this module never looks anybody up. */
  label: string;
  sessionCode?: string | null;
};

export type RosterDayTherapist = {
  id: string;
  fullName: string | null;
  specialization: string | null;
  timezone: string | null;
  onLeave: boolean;
};

/** What one hour of one therapist's day is.
 *
 *  `off` and `free` are deliberately different words: off is "not working",
 *  free is "working and nobody has it". An admin looking for somebody to take
 *  a 4 PM call needs to tell those apart, and a strip that showed only the
 *  free hours would make a therapist who works mornings look identical to one
 *  who is fully booked. */
export type RosterHourState = "free" | "booked" | "off";

export type RosterHour = {
  hour: number;
  state: RosterHourState;
  /** Set only on a booked hour. The session that holds it -- the *earliest*
   *  overlapping one, so a strip never names the second of two clashing
   *  sessions and hides the first. */
  appointment?: RosterDayAppointment;
};

export type RosterDayEntry = {
  therapist: RosterDayTherapist;
  /** Working at all on this date, leave included. */
  available: boolean;
  /** Why not, when not -- the two are different pieces of work for the admin
   *  reading it, and "unavailable" alone sends them to the wrong screen. */
  reason: "working" | "on_leave" | "not_rostered";
  hours: RosterHour[];
  workingCount: number;
  bookedCount: number;
  freeCount: number;
};

/** A session counts against an hour when the two overlap at all. */
function coversHour(
  appointment: RosterDayAppointment,
  dateKey: string,
  hour: number,
  timeZone: string
): boolean {
  if (!appointment.slotTime) return false;
  const start = new Date(appointment.slotTime).getTime();
  if (Number.isNaN(start)) return false;
  const minutes =
    appointment.durationMinutes && appointment.durationMinutes > 0
      ? appointment.durationMinutes
      : DEFAULT_SESSION_MINUTES;
  const end = start + minutes * 60_000;

  // The hour's own window, read in the therapist's zone rather than the
  // admin's -- the whole reason `zonedDayAndHour` exists. Built by walking
  // minute-free: an hour is covered when the session starts inside it, or
  // spans it from an earlier hour.
  const at = zonedDayAndHour(appointment.slotTime, timeZone);
  if (!at) return false;
  if (at.dateKey !== dateKey) {
    // A session that began the previous day can still run into this one.
    return false;
  }
  if (at.hour === hour) return true;
  if (at.hour > hour) return false;
  // Started earlier the same day: covered when it has not finished by the
  // time this hour begins.
  const hoursLater = hour - at.hour;
  return end > start + hoursLater * 3_600_000;
}

/** A cancelled session holds nothing -- the hour is free again, which is the
 *  whole point of cancelling one. */
function holdsAnHour(appointment: RosterDayAppointment): boolean {
  return appointment.status !== "cancelled";
}

/**
 * Every therapist's shape for one date.
 *
 * Returns them in the order they were given, so the caller decides the
 * ordering -- this module has no opinion about whose name comes first.
 */
export function buildRosterDay(
  dateKey: string,
  therapists: RosterDayTherapist[],
  templateByTherapist: Record<string, TemplateRow[]>,
  overrideByTherapist: Record<string, OverrideRow[]>,
  appointmentsByTherapist: Record<string, RosterDayAppointment[]>,
  fallbackTimeZone = "Asia/Kolkata"
): RosterDayEntry[] {
  return therapists.map((therapist) => {
    const timeZone = therapist.timezone || fallbackTimeZone;
    const availability = computeDayAvailability(
      dateKey,
      templateByTherapist[therapist.id] ?? [],
      overrideByTherapist[therapist.id] ?? []
    );
    const booked = (appointmentsByTherapist[therapist.id] ?? []).filter(holdsAnHour);

    const hours: RosterHour[] = AVAILABILITY_HOURS.map((hour) => {
      const state = availability[hour];
      const working = state === "available" || state === "override_available";
      // Leave empties the day without touching the schedule -- there is
      // nothing to restore on the way back because nothing was removed.
      if (therapist.onLeave || !working) return { hour, state: "off" as const };

      const covering = booked
        .filter((a) => coversHour(a, dateKey, hour, timeZone))
        .sort((a, b) =>
          (a.slotTime ?? "").localeCompare(b.slotTime ?? "")
        );
      if (covering.length === 0) return { hour, state: "free" as const };
      return { hour, state: "booked" as const, appointment: covering[0] };
    });

    const workingCount = hours.filter((h) => h.state !== "off").length;
    const bookedCount = hours.filter((h) => h.state === "booked").length;
    return {
      therapist,
      available: workingCount > 0,
      reason: therapist.onLeave ? "on_leave" : workingCount > 0 ? "working" : "not_rostered",
      hours,
      workingCount,
      bookedCount,
      freeCount: workingCount - bookedCount,
    };
  });
}

/** The one-line summary the day view leads with. Counted from the entries
 *  themselves rather than passed alongside them, so the figure and the list
 *  under it cannot disagree -- the rule `visibleQueueTotal` follows. */
export function summariseRosterDay(entries: RosterDayEntry[]): {
  available: number;
  onLeave: number;
  notRostered: number;
  freeHours: number;
  bookedHours: number;
} {
  return {
    available: entries.filter((e) => e.reason === "working").length,
    onLeave: entries.filter((e) => e.reason === "on_leave").length,
    notRostered: entries.filter((e) => e.reason === "not_rostered").length,
    freeHours: entries.reduce((sum, e) => sum + e.freeCount, 0),
    bookedHours: entries.reduce((sum, e) => sum + e.bookedCount, 0),
  };
}
