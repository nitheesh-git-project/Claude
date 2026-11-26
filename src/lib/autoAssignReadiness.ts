/**
 * Whether the roster is ready for "Assign a therapist automatically".
 *
 * Auto-assign confirms a paid session when exactly one therapist is free.
 * With one or two therapists that is most of the time, so the clinic would be
 * handing almost every booking to the roster before it has seen how bookings
 * fall. The staging review's advice, kept as a number: switch it on once
 * AUTO_ASSIGN_READY_AT therapists have real weekly hours. The setting stays
 * the owner's to flip; this only says where the roster stands.
 *
 * Dependency-free so the rule can be tested without a database.
 */

export const AUTO_ASSIGN_READY_AT = 3;

/** Approved, active therapists with at least one weekly hour. */
export function therapistsWithHours(
  therapists: readonly { id: string; approved?: boolean | null; active?: boolean | null }[],
  templateRows: readonly { therapist_id: string }[]
): number {
  const withHours = new Set(templateRows.map((r) => r.therapist_id));
  return therapists.filter((t) => t.approved !== false && t.active !== false && withHours.has(t.id)).length;
}

export function autoAssignReadiness(count: number): { ready: boolean; message: string } {
  const people = `${count} ${count === 1 ? "therapist has" : "therapists have"} weekly hours set`;
  if (count >= AUTO_ASSIGN_READY_AT) {
    return { ready: true, message: `${people} - enough for this to help.` };
  }
  return {
    ready: false,
    message: `${people}. We suggest switching this on at ${AUTO_ASSIGN_READY_AT} or more: with fewer, nearly every booking would be assigned without anyone looking.`,
  };
}
