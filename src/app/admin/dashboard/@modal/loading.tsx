// The wait for an intercepted detail overlay.
//
// Tapping a patient, therapist or condition name is a <Link> into this
// parallel-route slot, which reaches neither of the app's two loading
// signals: the teal bar is driven by `useRouter` transitions and this is not
// one, and an ancestor `loading.tsx` covers the page tree rather than a
// sibling slot. So the row was tapped, the server spent its render, and
// nothing on screen acknowledged any of it -- the admin taps again.
//
// It deliberately mirrors `DetailOverlayModal`'s own shell rather than
// reusing `RouteLoading`: the thing arriving is a sheet over the dashboard,
// so the wait should be that same sheet, and a full-page skeleton here would
// read as the dashboard itself being replaced.
export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-4xl rounded-2xl bg-slate-50 p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-teal-600"
          />
          <p className="text-xs font-semibold text-slate-500">Opening…</p>
        </div>
        {/* Roughly the shape of what lands: a header block, then rows. Sized
            so the sheet does not jump when the real content replaces it. */}
        <div className="mt-5 animate-pulse space-y-3">
          <div className="h-16 rounded-xl bg-slate-200/70" />
          <div className="h-24 rounded-xl bg-slate-200/70" />
          <div className="h-24 rounded-xl bg-slate-200/70" />
        </div>
      </div>
    </div>
  );
}
