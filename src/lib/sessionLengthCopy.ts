// What the public pages say about how long a session is.
//
// A session's length is per treatment category (`duration_minutes`, set in
// Catalog -> Conditions), and the pages used to print a fixed "60-minute"
// beside it: the programme band's lede, the programme dialog's footnote and
// the home page's hero figure all said 60 while the card, the booking
// wizard and the checkout said the category's own 30. The patient read two
// lengths for one session, one tap apart. Every sentence that names a length
// is built here from the rows themselves, so it can only ever say what the
// catalogue says -- and says no number at all when it does not know one.
// Dependency-free so it can be tested without rendering.

export type DurationRow = { duration_minutes?: number | null };

/** A usable length in minutes, or null for a missing or nonsensical one. */
export function knownMinutes(minutes: number | null | undefined): number | null {
  return typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0
    ? Math.round(minutes)
    : null;
}

/** Every distinct known length across the rows, shortest first. */
function distinctMinutes(rows: DurationRow[]): number[] {
  const set = new Set<number>();
  for (const row of rows) {
    const m = knownMinutes(row.duration_minutes);
    if (m !== null) set.add(m);
  }
  return [...set].sort((a, b) => a - b);
}

/** The one length every row shares, or null when they differ or none is known. */
export function sharedDurationMinutes(rows: DurationRow[]): number | null {
  const all = distinctMinutes(rows);
  // A row with no length known stops "same length" being a claim we can make.
  if (all.length !== 1 || rows.some((r) => knownMinutes(r.duration_minutes) === null)) {
    return null;
  }
  return all[0];
}

/** "30 min", "30-60 min" across differing rows, or null when none is known. */
export function durationRangeLabel(rows: DurationRow[]): string | null {
  const all = distinctMinutes(rows);
  if (all.length === 0) return null;
  if (all.length === 1) return `${all[0]} min`;
  return `${all[0]}-${all[all.length - 1]} min`;
}

/** The programme band's lede on / and /conditions (9-word budget). */
export function programmesLede(rows: DurationRow[]): string {
  const shared = sharedDurationMinutes(rows);
  return shared !== null
    ? `Same ${shared}-minute assessment. Different protocol.`
    : "One assessment to start. Different protocol.";
}

/** The home page's closing band body (12-word budget). */
export function closingSessionLine(rows: DurationRow[]): string {
  const shared = sharedDurationMinutes(rows);
  return shared !== null
    ? `One ${shared}-minute session. Leave with a plan.`
    : "One session. Leave with a plan.";
}

/** The footnote under a programme's detail dialog. */
export function programmeOpensWithLine(minutes: number | null | undefined): string {
  const m = knownMinutes(minutes);
  return m !== null
    ? `Every programme opens with an assessment - ${m} minutes, one-to-one.`
    : "Every programme opens with a one-to-one assessment.";
}
