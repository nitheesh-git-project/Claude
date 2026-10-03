
/**
 * Read every row of a query, in pages, and say so when it could not.
 *
 * **PostgREST caps every response at `max_rows`, and this project's is 1,000.**
 * That is not a setting this app chose and not one any call site mentions: a
 * `.select()` with no `.range()` simply stops at a thousand rows and answers
 * 200 with no error, no header anybody reads and nothing to distinguish it
 * from a table that genuinely holds a thousand rows.
 *
 * The audit called the admin dashboard's biggest reads "unbounded" and warned
 * that adding `.limit()` to them would make the Money figures **wrong rather
 * than slow** -- revenue quietly understated by however many rows fell off the
 * end. The warning was right and the premise was not: the cap is already
 * there. Those figures sum over `appointments`, so the first clinic to pass a
 * thousand appointments starts reading an understated revenue figure, in the
 * one direction nobody notices, with every screen agreeing with every other
 * screen because they all read the same truncated array.
 *
 * Three rules:
 *
 * 1. **It pages until the table ends**, so the answer is every row rather
 *    than the first page. `PAGE_SIZE` sits under `max_rows` deliberately --
 *    asking for exactly the cap makes "a full page" and "the server truncated
 *    me" the same observation, which is the ambiguity this exists to remove.
 * 2. **It is bounded, and a bound it hits is reported rather than hidden.**
 *    This runs inside a page render, so it cannot page for ever; past
 *    `maxRows` it stops and returns `truncated: true`. A caller summing money
 *    must show that rather than a total it did not earn -- the same rule the
 *    storage reconciliation follows when its own walk hits a cap.
 * 3. **An error on any page fails the whole read.** Returning the pages that
 *    did arrive would be a smaller number presented as a complete one, which
 *    is the failure this module exists to stop, one layer in.
 */

/** Under PostgREST's `max_rows` (1,000 here) so a full page is unambiguous. */
export const PAGE_SIZE = 500;

/**
 * How many rows one read may walk before giving up. Generous enough that no
 * clinic this product is for will reach it, small enough that a runaway query
 * cannot hold a render open indefinitely.
 */
export const DEFAULT_MAX_ROWS = 50_000;

export type ReadAllResult<T> = {
  rows: T[];
  /** The walk stopped at `maxRows` before the table ended. */
  truncated: boolean;
  /** The read failed. `rows` is empty and must not be summed. */
  error: unknown;
};

/**
 * `build` is called once per page and must return a fresh query -- a
 * PostgREST builder is single-use, so reusing one silently re-sends the first
 * page's range.
 */
/**
 * The one method this module needs off a PostgREST builder. Typed
 * structurally rather than against `PostgrestFilterBuilder`, whose five
 * generics differ per call site and would make every caller spell out its own
 * row type twice.
 */
type RangeableQuery<T> = {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>;
};

export async function readAllRows<T>(
  build: () => RangeableQuery<T>,
  options?: { maxRows?: number; pageSize?: number }
): Promise<ReadAllResult<T>> {
  const maxRows = options?.maxRows ?? DEFAULT_MAX_ROWS;
  const pageSize = Math.max(1, Math.min(options?.pageSize ?? PAGE_SIZE, PAGE_SIZE));
  const rows: T[] = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize, maxRows) - 1;
    const { data, error } = await build().range(from, to);
    if (error) return { rows: [], truncated: false, error };
    const page = data ?? [];
    rows.push(...page);
    // A short page is the end of the table. A full one is not evidence of
    // anything, which is why the loop asks again rather than guessing.
    if (page.length < to - from + 1) {
      return { rows, truncated: false, error: null };
    }
  }

  return { rows, truncated: true, error: null };
}

/**
 * `readAllRows` over an `.in(column, ids)` filter, in chunks.
 *
 * A long id list is a long URL, and PostgREST (and the proxies in front of
 * it) refuse one past a few kilobytes -- so a partner with a few hundred
 * referred patients stopped getting an answer at all. Each chunk is paged in
 * full; any chunk failing fails the whole read, same rule as above.
 */
export const ID_CHUNK_SIZE = 150;

export async function readAllRowsByIds<T>(
  ids: string[],
  build: (chunk: string[]) => RangeableQuery<T>,
  options?: { maxRows?: number }
): Promise<ReadAllResult<T>> {
  const rows: T[] = [];
  let truncated = false;
  for (let i = 0; i < ids.length; i += ID_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + ID_CHUNK_SIZE);
    const result = await readAllRows(() => build(chunk), options);
    if (result.error) return { rows: [], truncated: false, error: result.error };
    rows.push(...result.rows);
    truncated ||= result.truncated;
  }
  return { rows, truncated, error: null };
}

/**
 * `readAllRows` in the `{ data, error }` shape a `Promise.all` of plain
 * PostgREST calls already destructures, so a loader can swap a capped
 * `.select()` for a paged one without restructuring. A walk that hit
 * `maxRows` carries a `truncated` error rather than a quietly short list.
 */
export async function readAllRowsAsData<T>(
  build: () => RangeableQuery<T>,
  options?: { maxRows?: number }
): Promise<{ data: T[] | null; error: unknown }> {
  const result = await readAllRows(build, options);
  if (result.error) return { data: null, error: result.error };
  if (result.truncated) return { data: result.rows, error: { message: "truncated", code: "TRUNCATED" } };
  return { data: result.rows, error: null };
}
