"use client";

import { useState } from "react";
import FilterChips from "@/components/dashboard/FilterChips";
import ListPager from "@/components/dashboard/ListPager";
import { usePagedList } from "@/lib/usePagedList";
import Link from "next/link";
import { countNeedsYou, type FeedItem } from "@/lib/dashboardFeed";
import { EmptyState } from "@/components/dashboard/SurfaceCard";

const TONE_DOT: Record<string, string> = {
  neutral: "bg-slate-100 text-slate-500",
  info: "bg-blue-50 text-blue-600",
  good: "bg-emerald-50 text-emerald-600",
  warn: "bg-amber-50 text-amber-600",
  bad: "bg-red-50 text-red-600",
};

// Two things in here cannot agree between the server render and the
// browser's hydration of it, and both did exactly what they look like they
// would: an admin dashboard takes seconds to render, so `Date.now()` had
// moved on by the time the browser read the HTML ("6m ago" server, "5m ago"
// client), and `toLocaleDateString(undefined, ...)` formats in whatever
// locale the runtime has, which is not the visitor's. React's answer to a
// text mismatch is to throw away the whole subtree and re-render it, so
// every dashboard load -- all four roles share this component through
// DashboardOverview -- was rebuilding its feed and logging an uncaught
// error to do it.
//
// The locale is pinned. The clock is not fixable that way (a relative time
// is *meant* to differ a minute later), so the span carrying it is marked
// hydration-suppressed at the call site, which is what React documents that
// flag for. Suppressing keeps the server's text and skips the remount --
// the number is a minute stale for one paint, which is what "6m ago" means
// anyway.
function when(iso: string) {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (Number.isNaN(mins)) return "";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/**
 * One notification list, shared by all four dashboards (see
 * src/lib/dashboardFeed.ts for where the items come from).
 *
 * Items that still need the viewer are pulled to the top and counted in the
 * header, because "what is waiting on me" is the only part of a feed anyone
 * reads under time pressure; everything else is history and stays in
 * chronological order below it.
 */
export default function ActivityFeed({ items, emptyBody }: { items: FeedItem[]; emptyBody?: string }) {
  const [filter, setFilter] = useState<"all" | "needs_you">("all");

  const needsYou = items.filter((i) => i.needsYou);
  const rest = items.filter((i) => !i.needsYou);
  const ordered = filter === "needs_you" ? needsYou : [...needsYou, ...rest];
  const waiting = countNeedsYou(items);
  // Whatever still needs the viewer is sorted to the front, so page one is
  // always the part that matters. Called before the empty-state return:
  // a hook cannot sit behind a condition.
  const { rows: pageItems, pager } = usePagedList(ordered, {
    storageKey: "activity-feed",
    defaultPageSize: 8,
  });

  if (items.length === 0) {
    return (
      <EmptyState
        icon="fa-bell"
        title="Nothing new"
        body={emptyBody ?? "Updates about your account show up here as they happen."}
      />
    );
  }

  return (
    <div>
      {waiting > 0 && (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          <i aria-hidden className="fa-solid fa-circle-exclamation text-[11px]" />
          {waiting} {waiting === 1 ? "thing needs" : "things need"} you
        </p>
      )}
      {needsYou.length > 0 && (
        <FilterChips
          label="Filter updates"
          value={filter}
          onChange={setFilter}
          choices={[
            { key: "all", label: "Everything", count: items.length },
            { key: "needs_you", label: "Needs you", count: needsYou.length },
          ]}
        />
      )}

      <ul className="space-y-1">
        {pageItems.map((item) => {
          const row = (
            <div className="flex gap-3 rounded-xl px-2 py-2.5 transition hover:bg-slate-50">
              <span
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${TONE_DOT[item.tone] ?? TONE_DOT.neutral}`}
              >
                <i aria-hidden className={`fa-solid ${item.icon} text-[11px]`} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug text-slate-800">{item.title}</p>
                {item.detail && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{item.detail}</p>}
              </div>
              <span suppressHydrationWarning className="shrink-0 text-[11px] text-slate-400">
                {when(item.at)}
              </span>
            </div>
          );
          return (
            <li key={item.id}>
              {item.href ? (
                <Link href={item.href} className="block">
                  {row}
                </Link>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
      <ListPager pager={pager} noun="update" />
    </div>
  );
}
