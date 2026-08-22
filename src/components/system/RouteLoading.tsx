/**
 * The skeleton shown while a route's server work is in flight.
 *
 * Every dashboard page here is dynamic and some are query-heavy (the admin
 * dashboard makes roughly seventy), so without a loading boundary the
 * browser sits on the previous screen with no acknowledgement that a tap
 * registered — which reads as a dead click, and gets tapped again.
 *
 * Shaped like the layout it stands in for (a heading, a strip of figures,
 * then cards) rather than a spinner: matching the eventual furniture makes
 * the swap feel like content arriving instead of the page changing twice.
 */
export default function RouteLoading({
  label = "Loading",
  withSidebar = false,
}: {
  label?: string;
  /** Dashboard trees render their sidebar inside each page rather than a
   *  shared layout, so a bare skeleton here would blank the whole chrome on
   *  every navigation — worse than the no-boundary behaviour it replaces.
   *  This keeps a rail in place so only the content area changes. */
  withSidebar?: boolean;
}) {
  if (withSidebar) {
    return (
      <div className="min-h-screen bg-slate-50" aria-busy="true" aria-live="polite">
        <span className="sr-only">{label}…</span>
        <div className="fixed inset-y-0 left-0 hidden w-64 bg-slate-900 lg:block" />
        <div className="animate-pulse px-4 py-8 sm:px-6 lg:pl-72 lg:pr-8">
          <Skeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-pulse px-1 py-2" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}…</span>
      <Skeleton />
    </div>
  );
}

function Skeleton() {
  return (
    <>
      <div className="h-7 w-56 rounded-lg bg-slate-200" />
      <div className="mt-2 h-4 w-80 max-w-full rounded bg-slate-100" />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="h-3 w-20 rounded bg-slate-100" />
            <div className="mt-3 h-6 w-24 rounded bg-slate-200" />
            <div className="mt-2 h-3 w-28 rounded bg-slate-100" />
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="h-4 w-40 rounded bg-slate-200" />
            <div className="mt-4 space-y-2.5">
              <div className="h-3 w-full rounded bg-slate-100" />
              <div className="h-3 w-11/12 rounded bg-slate-100" />
              <div className="h-3 w-9/12 rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
