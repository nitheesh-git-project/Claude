import Link from "next/link";

/**
 * Shown on every patient screen while the physiotherapist has a guided video
 * assessment open: the way to the companion screen. It appears and goes by
 * itself (the shell refreshes on the live display table).
 */
export default function GuidedCheckBar() {
  return (
    <Link
      href="/patient/dashboard/session"
      data-testid="guided-check-bar"
      className="mb-6 flex items-center gap-3 rounded-2xl border border-teal-300 bg-teal-50 p-3 pr-4 transition hover:border-teal-500"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white">
        <i className="fa-solid fa-display" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-teal-800">Happening now</span>
        <span className="block text-sm font-semibold text-slate-900">Your physiotherapist has started a guided check. Open the screen to follow it.</span>
      </span>
      <span className="shrink-0 text-xs font-semibold text-teal-800">
        Open <i className="fa-solid fa-arrow-right ml-0.5 text-[10px]" aria-hidden="true" />
      </span>
    </Link>
  );
}
