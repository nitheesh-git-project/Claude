import WordRollLoader from "@/components/system/WordRollLoader";
import { isDebugNavVisible } from "@/lib/debugNavVisible";

/**
 * What a dashboard shows from the first moment, while its page is still
 * being put together: the dashboard's own frame -- the phone's top bar and
 * tab bar, the laptop's icon rail, the desktop sidebar -- in the exact places
 * the real ones will be, with the word-roll loader where the content goes.
 *
 * It is a `loading.tsx` for each dashboard, which is what lets the server
 * send this before any of the page's data is read; without one a dashboard
 * sent nothing at all until its last read came back, and a slow load looked
 * like a frozen screen. The dashboards used to avoid a loading boundary
 * because a plain loader replaced the sidebar (each shell draws its own
 * sidebar inside its page), so every tab tap flashed an empty rail. Drawing
 * the frame here, in the shell's own sizes and positions, is what keeps
 * that from happening: the real sidebar lands on top of its outline.
 *
 * The placeholders are blank on purpose: the entries differ by role and by
 * what this person has, and a skeleton that guessed them would be a menu
 * that changes under the reader's finger.
 */
export default function DashboardLoading({ label = "Loading your dashboard…" }: { label?: string }) {
  const offsetTop = isDebugNavVisible();
  const top = offsetTop ? "top-[41px] h-[calc(100vh-41px)]" : "top-0 h-screen";
  return (
    <div className="min-h-screen bg-slate-50" aria-busy="true" data-testid="dashboard-loading">
      {/* phone top bar */}
      <div
        className={`sticky z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 pl-4 pr-2 lg:hidden ${
          offsetTop ? "top-[41px]" : "top-0"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <span className="h-8 w-8 rounded-xl bg-teal-700" />
          <span className="h-3.5 w-36 rounded-full bg-slate-200" />
        </div>
        <span className="mr-1.5 h-[34px] w-[34px] rounded-full bg-slate-200" />
      </div>

      {/* laptop icon rail */}
      <div className={`fixed left-0 z-30 hidden w-[88px] flex-col items-center gap-3 border-r border-slate-200 bg-white py-3 lg:flex 2xl:hidden ${top}`}>
        <span className="mb-2 h-10 w-10 rounded-xl bg-teal-700" />
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="h-11 w-14 rounded-xl bg-slate-100" />
        ))}
      </div>

      {/* desktop sidebar */}
      <div className={`fixed left-0 z-30 hidden w-64 flex-col gap-2 border-r border-slate-200 bg-white p-4 2xl:flex ${top}`}>
        <div className="mb-3 flex items-center gap-2.5 px-1">
          <span className="h-10 w-10 rounded-xl bg-teal-700" />
          <span className="h-4 w-32 rounded-full bg-slate-200" />
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="h-11 rounded-xl bg-slate-100" />
        ))}
      </div>

      {/* phone tab bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white px-1 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5 lg:hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="flex h-12 flex-col items-center justify-center gap-1.5">
            <span className={i === 2 ? "-mt-6 h-14 w-14 rounded-full border-4 border-white bg-teal-700" : "h-5 w-5 rounded-md bg-slate-200"} />
            {i !== 2 && <span className="h-2 w-10 rounded-full bg-slate-100" />}
          </span>
        ))}
      </div>

      {/* the content area */}
      <div className="pb-[calc(10.5rem+env(safe-area-inset-bottom))] lg:pb-28 lg:pl-[88px] 2xl:pl-64">
        <div className="flex min-h-[70vh] items-center justify-center px-4 py-6">
          <WordRollLoader label={label} />
        </div>
      </div>
    </div>
  );
}
