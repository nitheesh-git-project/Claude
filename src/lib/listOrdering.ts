/**
 * Moving a row up or down a manually ordered admin list.
 *
 * Lives here rather than inside the component for the reason the rest of
 * `src/lib` does: this is the part of the reorder that can be wrong in a way
 * no render shows you. The bug it replaces was exactly that shape -- a
 * pairwise `display_order` swap that silently did nothing whenever the two
 * rows already held the same number, which every category created without
 * someone typing an Order did.
 */

/**
 * Returns `ids` with the entry at `id` moved one place in `direction`.
 *
 * Returns the input array unchanged (same contents) when the id is unknown or
 * already at the end it is being moved towards, so a caller can compare
 * against the original rather than special-casing the ends.
 */
export function moveIdOnePlace(
  ids: string[],
  id: string,
  direction: "up" | "down"
): string[] {
  const index = ids.indexOf(id);
  if (index === -1) return ids;
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  return next;
}

/**
 * Whether the on-screen order differs from the saved one.
 *
 * Position-by-position, not a set comparison: the whole point is that the
 * same rows in a different order is a change. A different *set* is not a
 * reorder at all -- the caller resyncs from the server in that case, and the
 * save route refuses a list that does not cover every row.
 */
export function isOrderChanged(current: string[], saved: string[]): boolean {
  if (current.length !== saved.length) return true;
  return current.some((id, i) => id !== saved[i]);
}
