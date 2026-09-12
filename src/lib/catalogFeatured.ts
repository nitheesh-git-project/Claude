/**
 * Which of the catalogue the public pages lead with.
 *
 * The home page listed every active condition -- ten cards and climbing --
 * so the page whose job is to say what this clinic *is* spent most of its
 * length being an index. Four are featured there now, with the rest one tap
 * away.
 *
 * Dependency-free so the rule can be tested without a database, which is
 * where every judgement in this codebase that decides what a visitor sees
 * lives.
 */

/**
 * How many featured rows a public page shows.
 *
 * Four because it divides: the home page's catalog grid is two columns from
 * `md` up, so four is two full rows with no gap. `/home-visit` runs three
 * columns at `lg`, where four leaves the fourth card alone on its own row --
 * accepted rather than designed around, since that page has two visits today
 * and the alternative is a different count on each page, which is a worse
 * thing to explain than an uneven row.
 */
export const FEATURED_LIMIT = 4;

export type FeaturableRow = { id: string; featured?: boolean | null };

/**
 * The rows to show, and whether anything is left behind them.
 *
 * Two rules, and both are about what an empty answer means:
 *
 *  - **Nothing ticked falls back to the first rows.** A band that renders
 *    nothing because an admin has not opened the screen yet reads as the
 *    clinic having shut, not as a setting nobody set. The page is never
 *    emptier than it was before this existed, which is what makes shipping
 *    the column and the UI in one change safe.
 *  - **More ticked than the limit is not an error.** The first `limit` by
 *    the order they arrive in are shown and the rest are not; the admin
 *    screen says how many are ticked, so the cap is visible where it is set
 *    rather than discovered on the live site.
 *
 * `hasMore` answers "is there anything the visitor cannot see here", which
 * is the only honest basis for offering them a way to see more: a button
 * that opens a list identical to the one above it is a dead end with a
 * label.
 */
export function pickFeatured<T extends FeaturableRow>(
  rows: T[],
  limit: number = FEATURED_LIMIT
): { shown: T[]; hasMore: boolean } {
  const ticked = rows.filter((r) => r.featured === true);
  const pool = ticked.length > 0 ? ticked : rows;
  const shown = pool.slice(0, limit);
  return { shown, hasMore: rows.length > shown.length };
}

/** How many rows an admin has ticked, for the sentence on the admin screen
 *  that tells them how many of those actually reach the page. */
export function countFeatured(rows: FeaturableRow[]): number {
  return rows.filter((r) => r.featured === true).length;
}
