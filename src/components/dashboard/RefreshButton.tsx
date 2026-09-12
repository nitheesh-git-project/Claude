"use client";

import { useTransition } from "react";
import { useRouter } from "@/lib/useRouter";

// "Show me what is there now", on every dashboard.
//
// All four are Server Components, and the ones that update themselves do it
// through `RealtimeRefresh` -- which only fires for tables the shell
// subscribes to, and on the catalog channel holds a 30-second cooldown. So
// there was no way for somebody looking at a screen to ask for it again
// short of a browser reload, which on these pages throws away the client
// state the shells keep on purpose (an open row, a half-typed filter, the
// sidebar's collapsed state) and re-downloads the bundle.
//
// This re-runs the Server Component and nothing else. Three things about the
// shape:
//
//  1. **It holds its own pending state, and that is correct here** -- unlike
//     a mutating control, where the button owns its request and the teal bar
//     owns the refresh. This button's entire job *is* the refresh, so
//     releasing it early would leave it looking idle while the work it was
//     asked for was still running.
//  2. **`useRouter` is the wrapped one** (`src/lib/useRouter.ts`), so the
//     refresh also reports to `PendingWorkProvider` and the teal bar draws.
//     The icon says which control started it; the bar says the page is
//     thinking.
//  3. **It is disabled while pending.** Stacking refreshes on the admin
//     dashboard means stacking ~40 queries per tap, and the second one tells
//     nobody anything the first was not already about to.
export default function RefreshButton({
  className = "",
  /** Icon only. For a header that is already tight, or a mobile bar. */
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={isPending}
      // The accessible name is constant, so it does not change under a
      // screen reader mid-action; the visible text is what moves.
      aria-label="Refresh this screen"
      title="Refresh this screen"
      className={`inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      <i
        aria-hidden
        className={`fa-solid fa-rotate-right text-[11px] ${isPending ? "animate-spin" : ""}`}
      />
      {!compact && <span>{isPending ? "Refreshing…" : "Refresh"}</span>}
    </button>
  );
}
