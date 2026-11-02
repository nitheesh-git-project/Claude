// The therapist Overview's "Next up" (B9): the session in progress now, if
// there is one, else the next one booked. A session that has started is the
// one the therapist needs Join, the guided assessment and Done for - the old
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
