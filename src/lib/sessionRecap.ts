// The patient's recap after a session (guided check, phase 2, P6): one card
// on the Overview for a week after their physiotherapist shares a summary -
// what was done, what to do before next time, the home exercises and the
// next session - so leaving the call is not "You can close this screen" and
// nothing else. Dependency-free. Every word in it is the physiotherapist's
// own (the shared summary) or a count and a date; never the session note.

export const RECAP_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type RecapInput = {
  /** The newest summary shared with this patient (session_summaries). */
  summary: { appointmentId: string; whatWeDid: string | null; beforeNextTime: string | null; createdAt: string; updatedAt: string | null } | null;
  writtenBy: string;
  exercises: { count: number; parent: boolean } | null;
  next: { slotTime: string } | null;
  nowMs: number;
};

export type Recap = {
  appointmentId: string;
  writtenBy: string;
  writtenAt: string;
  whatWeDid: string | null;
  beforeNextTime: string | null;
  exercisesLine: string | null;
  nextSlotTime: string | null;
};

/** The recap to show, or null: no summary, an empty one, or one more than a
 *  week old (by its latest edit). */
export function sessionRecap(input: RecapInput): Recap | null {
  const s = input.summary;
  if (!s) return null;
  const whatWeDid = s.whatWeDid?.trim() || null;
  const beforeNextTime = s.beforeNextTime?.trim() || null;
  if (!whatWeDid && !beforeNextTime) return null;
  const at = Date.parse(s.updatedAt ?? s.createdAt);
  if (!Number.isFinite(at) || input.nowMs - at > RECAP_DAYS * DAY_MS || at - input.nowMs > DAY_MS) return null;
  const n = input.exercises?.count ?? 0;
  const exercisesLine =
    n > 0 ? `${n} home ${n === 1 ? "exercise" : "exercises"} ${input.exercises?.parent ? "for your child" : "to do"}` : null;
  return {
    appointmentId: s.appointmentId,
    writtenBy: input.writtenBy,
    writtenAt: s.updatedAt ?? s.createdAt,
    whatWeDid,
    beforeNextTime,
    exercisesLine,
    nextSlotTime: input.next?.slotTime ?? null,
  };
}
