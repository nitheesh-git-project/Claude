// Whether a treatment category can be deleted, and what to say when it
// cannot.
//
// Deleting one used to answer `{ success: true }` whether or not a row had
// gone. supabase-js reports no error when a DELETE matches nothing, so a
// refusal from the database, a row somebody else had already removed and a
// genuine deletion were the same response -- and the screen, having been
// told it worked, refreshed and painted the category still sitting there.
// "Delete does nothing" with no message anywhere is the worst shape a
// failure can take: there is nothing to act on and nothing to report.
//
// So the route counts what points at the category before trying, and this
// module turns those counts into the sentence an admin reads. It is
// dependency-free so the wording and the arithmetic are unit-tested rather
// than discovered on a live catalogue.

/** Rows that keep a category alive. Each one is a foreign key with no
 *  ON DELETE behaviour, so Postgres refuses the delete outright (23503). */
export type CategoryReferences = {
  /** Sessions booked under this condition. */
  appointments: number;
  /** Programmes bought under it. */
  packagePurchases: number;
  /** Home-visit packages filed under it. */
  homeVisitPackages: number;
  /** Rows in the reassignment log naming it as an old or new category. */
  reassignments: number;
};

export const NO_REFERENCES: CategoryReferences = {
  appointments: 0,
  packagePurchases: 0,
  homeVisitPackages: 0,
  reassignments: 0,
};

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The refusal, or null when nothing is in the way.
 *
 * Names what is actually holding it rather than "it has bookings": an admin
 * who deleted the last session under a condition and still cannot remove it
 * needs to know a home-visit package is the thing left, or they will keep
 * trying. Counts, because "some sessions" and "one session from a test in
 * March" call for different decisions.
 */
export function describeCategoryBlockers(
  refs: CategoryReferences
): { message: string; total: number } | null {
  const parts: string[] = [];
  if (refs.appointments > 0) parts.push(plural(refs.appointments, "session", "sessions"));
  if (refs.packagePurchases > 0) {
    parts.push(plural(refs.packagePurchases, "programme purchase", "programme purchases"));
  }
  if (refs.homeVisitPackages > 0) {
    parts.push(plural(refs.homeVisitPackages, "home-visit package", "home-visit packages"));
  }
  if (refs.reassignments > 0) {
    parts.push(plural(refs.reassignments, "reassignment record", "reassignment records"));
  }

  if (parts.length === 0) return null;

  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  const total =
    refs.appointments + refs.packagePurchases + refs.homeVisitPackages + refs.reassignments;

  return {
    // The alternative is named because it is what the admin actually wants:
    // the condition off the public site and out of the booking picker, with
    // the history of what was sold under it intact.
    message: `${list} still use this condition, so it cannot be deleted - that would erase what those patients were sold. Turn it off instead: it disappears from the website and the booking picker, and everything already booked under it stays as it is.`,
    total,
  };
}

/** What the route says when the delete ran and removed nothing, with no
 *  blocker to explain it. Two different situations, and an admin can act on
 *  each -- unlike the silent success that used to cover both. */
export const CATEGORY_ALREADY_GONE =
  "That condition has already been deleted. Refresh to see the current list.";

export const CATEGORY_DELETE_REFUSED =
  "The database refused to delete that condition and did not say why. Nothing has changed. Check that this deployment's service-role key is set, then try again.";
