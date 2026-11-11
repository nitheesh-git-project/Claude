import PopupLoading from "@/components/system/PopupLoading";

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
        {/* One loader filling the sheet. There used to be grey placeholder
            bars under a small loader, which read as the bottom of the pop-up
            failing to load (PopupLoading has the story). */}
        <PopupLoading label="Opening…" className="min-h-[60vh]" />
      </div>
    </div>
  );
}
