// Which tab a session belongs under on a dashboard's session list.
//
// "Upcoming" used to mean "starts later than now", so a session that had
// begun but was not yet finished dropped into Past the moment it started --
// the therapist went looking for its Done button among last month's sessions,
// and a patient joining a call found it under Past. A session still open
// (requested or confirmed) stays under Upcoming for a day after its start,
// which is the work still in front of somebody; after that it is past.
// Dependency-free so it can be tested without rendering.

export type SessionBucket = "upcoming" | "past" | "cancelled";

/** How long a started-but-unfinished session keeps its place under Upcoming. */
export const OPEN_SESSION_GRACE_MS = 24 * 3_600_000;

export function sessionBucket(
  s: { status: string; slotTime: string | null },
  nowMs: number
): SessionBucket {
  if (s.status === "cancelled") return "cancelled";
  if (!s.slotTime) return "past";
  const at = new Date(s.slotTime).getTime();
  if (Number.isNaN(at)) return "past";
  if (at >= nowMs) return "upcoming";
  const stillOpen = s.status === "requested" || s.status === "confirmed";
  return stillOpen && nowMs - at <= OPEN_SESSION_GRACE_MS ? "upcoming" : "past";
}
