// The therapist Overview's "Next up" (B9): the session in progress now, if
// there is one, else the next one booked. A session that has started is the
// one the therapist needs Join, the guided check and Done for - the old
// headline only ever named the next FUTURE slot, so during a session it
// pointed at the one after. Dependency-free; `nowMs` is required so the
// debug clock reaches it.

export type NextUpAppointment = {
  status: string;
  slot_time: string | null;
  no_show?: boolean | null;
  duration_minutes?: number | null;
};

const DEFAULT_MINUTES = 45;
/** How long after its end a session still counts as "now": time to finish the note. */
export const NEXT_UP_GRACE_MINUTES = 30;

export function pickNextUp<T extends NextUpAppointment>(appointments: readonly T[], nowMs: number): { appointment: T; phase: "now" | "later" } | null {
  const slot = (a: T) => (a.slot_time ? Date.parse(a.slot_time) : NaN);
  const live = appointments
    .filter((a) => a.status === "confirmed" && !a.no_show && Number.isFinite(slot(a)))
    .filter((a) => {
      const start = slot(a);
      const end = start + ((a.duration_minutes ?? DEFAULT_MINUTES) + NEXT_UP_GRACE_MINUTES) * 60_000;
      return start <= nowMs && nowMs < end;
    })
    .sort((a, b) => slot(a) - slot(b));
  if (live.length > 0) return { appointment: live[0], phase: "now" };
  const later = appointments
    .filter((a) => (a.status === "confirmed" || a.status === "requested") && Number.isFinite(slot(a)) && slot(a) > nowMs)
    .sort((a, b) => slot(a) - slot(b));
  return later.length > 0 ? { appointment: later[0], phase: "later" } : null;
}

/**
 * What Home's headline says when there is no session in progress and none
 * ahead. "No sessions booked yet" was said to a therapist whose Today list
 * sat right under it with sessions in -- they had all happened, or were
 * waiting to be marked complete. Booked-yet is only true of nobody's
 * sessions at all.
 */
export function therapistNoNextUpLine<T extends NextUpAppointment>(appointments: readonly T[], nowMs: number): string {
  const slot = (a: T) => (a.slot_time ? Date.parse(a.slot_time) : NaN);
  const toFinish = appointments.filter(
    (a) =>
      a.status === "confirmed" &&
      !a.no_show &&
      Number.isFinite(slot(a)) &&
      slot(a) + (a.duration_minutes ?? DEFAULT_MINUTES) * 60_000 <= nowMs
  ).length;
  if (toFinish > 0) {
    return `Nothing else booked for now - ${toFinish} session${toFinish === 1 ? "" : "s"} to mark complete.`;
  }
  if (appointments.some((a) => a.status !== "cancelled")) {
    return "Nothing else booked for now - keep your availability open and the clinic assigns work to it.";
  }
  return "No sessions booked yet - keep your availability open and the clinic assigns work to it.";
}
