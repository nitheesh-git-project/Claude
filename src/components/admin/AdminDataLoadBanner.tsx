/**
 * The line the dashboard carries when one of its own reads did not come
 * back.
 *
 * Every read on this page is deliberately isolated so that one failure
 * costs its own panel rather than the screen -- and the cost of that
 * isolation is that a failed read renders as an empty one. A load test made
 * the difference concrete: at 40 concurrent renders, fifteen of them
 * returned HTTP 200 having lost the appointments query outright, so every
 * money figure, every queue count and every session list on those renders
 * was computed from an empty array. Nothing on the screen said so. The only
 * trace was a `console.error` in the server log, which is not a place a
 * clinic owner looks.
 *
 * This is the codebase's own rule applied to a page rather than to a
 * function: a check that could not be run is not a check that came back
 * negative. A zero that means "nothing happened" and a zero that means "we
 * could not ask" are opposite facts, and they render identically.
 *
 * It names the missing data rather than the error, and tells the reader the
 * one useful thing -- refresh, and if it persists the figures below are not
 * to be trusted. It is shown to every scope, because a wrong figure is
 * wrong for whoever is reading it.
 *
 * **`truncated` is the same rule for the opposite cause**, and it is the
 * quieter of the two. A read that failed at least fails; a read that hit
 * PostgREST's `max_rows` succeeds, answers 200, and hands back a prefix of
 * the table with nothing to say it did -- so every figure summed over it is
 * understated and every screen agrees with every other screen about the wrong
 * number. `readAllRows` walks past the cap and reports the one case it could
 * not finish, and this is where that lands. It is amber rather than red
 * because the figures are not garbage, they are short, and the action is
 * different: this one wants a narrower date range, not a refresh.
 */
export default function AdminDataLoadBanner({
  missing,
  truncated = [],
}: {
  missing: string[];
  truncated?: string[];
}) {
  if (missing.length === 0 && truncated.length === 0) return null;

  const list =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;

  const truncatedList =
    truncated.length === 1
      ? truncated[0]
      : `${truncated.slice(0, -1).join(", ")} and ${truncated[truncated.length - 1]}`;

  if (missing.length === 0) {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm sm:p-5"
      >
        <i aria-hidden className="fa-solid fa-triangle-exclamation mt-0.5 text-lg text-amber-600" />
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm font-bold text-amber-900">
            This screen is showing part of the data
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-amber-800">
            There is more {truncatedList} than this screen reads in one go, so
            the figures below cover only part of it and are understated.
          </span>
          <span className="mt-1.5 block text-[11px] font-semibold text-amber-700">
            Narrow the date range to get a figure you can rely on.
          </span>
        </span>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl border border-red-300 bg-red-50 p-4 shadow-sm sm:p-5"
    >
      <i aria-hidden className="fa-solid fa-triangle-exclamation mt-0.5 text-lg text-red-600" />
      <span className="min-w-0 flex-1">
        <span className="block font-display text-sm font-bold text-red-900">
          Some of this screen could not be loaded
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-red-800">
          We could not read {list} just now, so the figures and lists below are
          incomplete. They are not showing zero because nothing happened — they
          are showing what we managed to read.
        </span>
        <span className="mt-1.5 block text-[11px] font-semibold text-red-700">
          Refresh this screen. If it keeps saying this, the database is not
          answering and nothing here should be acted on.
        </span>
      </span>
    </div>
  );
}
