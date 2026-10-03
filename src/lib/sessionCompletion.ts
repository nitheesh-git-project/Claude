// When a therapist may close a session, as either delivered or a no-show.
//
// Completion used to open at `slot time - join window` -- the moment the Join
// button lights up -- for both outcomes. A session could be marked done
// before it had begun, and a patient marked a no-show before they could
// possibly be late: a premature no-show forfeits the patient's programme
// credit and creates the therapist's earnings for a session that never had a
// chance to happen.
//
// - Done: once the session's scheduled start has arrived.
// - No-show: once the late-arrival grace (`join_window_after_minutes`, the
//   same "how late can somebody join" figure the Join button uses) has
//   passed after the start.
//
// An admin correcting the record is not subject to either; the route
// exempts them. Dependency-free so the boundary is unit-tested.

export type CompletionKind = "done" | "no_show";

export function completionOpensAtMs(
  slotMs: number,
  kind: CompletionKind,
  lateGraceMinutes: number
): number {
  if (kind === "done") return slotMs;
  return slotMs + Math.max(0, lateGraceMinutes) * 60_000;
}

export function completionRefusal(kind: CompletionKind, lateGraceMinutes: number): string {
  return kind === "done"
    ? "This session hasn't started yet. You can mark it done once it's under way."
    : `A patient counts as a no-show once they're more than ${Math.max(
        0,
        lateGraceMinutes
      )} minutes late. Try again after that.`;
}
