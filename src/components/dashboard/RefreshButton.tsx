"use client";

import { useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useLiveUpdates } from "@/lib/liveUpdates";

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
//  4. **It says how many changes are waiting**, where the shell counts them
//     rather than rebuilding for each (`RealtimeRefresh mode="notify"`, the
//     admin dashboard). Without the count this button asks somebody to guess
//     whether there is anything to fetch; with it, the one control that
//     changes the screen is also the one that says the screen is behind. The
//     count comes from `useLiveUpdates`, which answers 0 outside a provider,
//     so the three dashboards that still refresh themselves render exactly
//     as before.
//
// The accessible name stays "Refresh this screen" whatever the count: a name
// that changed under a screen reader mid-action would be read as a different
// control. The count is announced separately, once, by its own status
// region.
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
  const { pending } = useLiveUpdates();

  // Past ten the exact figure stops being information and starts being a
  // wide button: what it is telling somebody is "a lot has happened".
  const countLabel = pending > 9 ? "9+" : String(pending);
  const hasUpdates = pending > 0 && !isPending;

  return (
    <>
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={isPending}
      // The accessible name is constant, so it does not change under a
      // screen reader mid-action; the visible text is what moves.
      aria-label="Refresh this screen"
      title="Refresh this screen"
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
        hasUpdates
          ? "border-teal-300 bg-teal-50 text-teal-800 hover:bg-teal-100"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      } ${className}`}
    >
      <i
        aria-hidden
        className={`fa-solid fa-rotate-right text-[11px] ${isPending ? "animate-spin" : ""}`}
      />
      {!compact && <span>{isPending ? "Refreshing…" : "Refresh"}</span>}
      {hasUpdates && (
        // Compact mode has no label to sit beside, so the count is the whole
        // of the signal there and still has to be legible -- a bare dot would
        // say something changed without saying it is worth a tap.
        <span
          aria-hidden
          className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-teal-700 px-1.5 py-0.5 text-[10px] font-bold text-white"
        >
          {countLabel}
        </span>
      )}
    </button>
    {/* Announced once when it changes, rather than folded into the button's
        name. "update" is the patient-and-owner word for it; "change" reads
        as something they did. */}
    <span role="status" aria-live="polite" className="sr-only">
      {hasUpdates
        ? `${pending} update${pending === 1 ? "" : "s"} since you last refreshed`
        : ""}
    </span>
    </>
  );
}
