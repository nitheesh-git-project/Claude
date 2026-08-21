import Link from "next/link";
import type { ReactNode } from "react";
import StatStrip, { type StatCell } from "@/components/dashboard/StatStrip";
import SurfaceCard from "@/components/dashboard/SurfaceCard";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import type { FeedItem } from "@/lib/dashboardFeed";

export type QuickAction = {
  label: string;
  hint?: string;
  icon: string;
  href: string;
  /** The one action this role is most likely to want. Rendered filled. */
  primary?: boolean;
};

/**
 * The first screen of every dashboard — patient, therapist, hospital and
 * admin all render this exact component with their own numbers.
 *
 * The order is the answer to three questions people actually open a
 * dashboard for, in the order they ask them: how am I doing (the strip),
 * what needs me (the feed), what do I do next (the actions). Each role
 * used to answer these differently or not at all — the patient landed on a
 * booking form, the therapist on an availability grid, the hospital on a
 * referral form — so nobody could tell at a glance whether anything was
 * waiting on them.
 */
export default function DashboardOverview({
  greeting,
  headline,
  cells,
  stripFooter,
  feed,
  feedTitle = "What's happening",
  feedEmptyBody,
  actions,
  aside,
}: {
  greeting?: string;
  /** One sentence naming the single most important fact right now — the
   *  next session, the next payout, the queue that is longest. */
  headline?: ReactNode;
  cells: StatCell[];
  stripFooter?: ReactNode;
  feed: FeedItem[];
  feedTitle?: string;
  feedEmptyBody?: string;
  actions: QuickAction[];
  /** Anything role-specific that belongs beside the feed rather than in
   *  its own section — the admin's queue counts, a patient's next visit. */
  aside?: ReactNode;
}) {
  return (
    <section id="overview" className="scroll-mt-24 space-y-5">
      {(greeting || headline) && (
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-teal-50/80 via-white to-white p-5 shadow-sm sm:p-6">
          {greeting && (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">{greeting}</p>
          )}
          {headline && (
            <div className="mt-1 font-display text-lg font-bold leading-snug text-slate-800 sm:text-xl">
              {headline}
            </div>
          )}
        </div>
      )}

      <StatStrip cells={cells} footer={stripFooter} />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <SurfaceCard title={feedTitle} icon="fa-bell" subtitle="Newest first. Anything waiting on you is pinned to the top.">
          <ActivityFeed items={feed} emptyBody={feedEmptyBody} />
        </SurfaceCard>

        <div className="space-y-5">
          <SurfaceCard title="Quick actions" icon="fa-bolt">
            <ul className="space-y-2">
              {actions.map((action) => (
                <li key={action.href + action.label}>
                  <Link
                    href={action.href}
                    className={`flex items-center gap-3 rounded-xl px-3.5 py-3 transition ${
                      action.primary
                        ? "bg-teal-700 text-white hover:bg-teal-800"
                        : "border border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50/40"
                    }`}
                  >
                    <i
                      aria-hidden
                      className={`fa-solid ${action.icon} w-4 text-center text-sm ${
                        action.primary ? "text-white" : "text-teal-600"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{action.label}</span>
                      {action.hint && (
                        <span
                          className={`block text-[11px] ${action.primary ? "text-teal-50" : "text-slate-500"}`}
                        >
                          {action.hint}
                        </span>
                      )}
                    </span>
                    <i
                      aria-hidden
                      className={`fa-solid fa-arrow-right text-[11px] ${
                        action.primary ? "text-teal-100" : "text-slate-300"
                      }`}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </SurfaceCard>

          {aside}
        </div>
      </div>
    </section>
  );
}
