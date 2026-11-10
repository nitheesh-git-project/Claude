/**
 * Starts a read now, to be awaited later where its answer is used.
 *
 * The dashboards' loaders were written top to bottom, so every read waited
 * for the one above it even when it needed nothing from it. Each database
 * round trip is a few hundred milliseconds from a server that is not beside
 * the database, and a chain of fifteen of them is most of a five-second
 * dashboard. Starting each read as soon as its inputs are known, and
 * awaiting it only where the code already did, keeps every line of logic
 * where it was and runs the waits side by side.
 *
 * Two details make that safe:
 * - **A Supabase query is lazy.** The builder runs only when something calls
 *   `then`, so this calls it, synchronously -- not `Promise.resolve`, which
 *   only gets round to it a tick later.
 * - **A rejection waiting to be awaited is not "unhandled".** Without the
 *   attached no-op, a read that fails before the code reaches its `await`
 *   would be reported as an unhandled rejection; the `await` still throws
 *   exactly as it did, so each caller's own error handling is unchanged.
 */
export function startEarly<T>(read: PromiseLike<T>): Promise<T> {
  const started = new Promise<T>((resolve, reject) => {
    read.then(resolve, reject);
  });
  started.catch(() => {});
  return started;
}
