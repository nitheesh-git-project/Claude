import Link from "next/link";
import { adminScreenHref, type AdminSectionKey } from "@/lib/adminNav";

// The action inbox: everything waiting on an admin, in one list.
//
// Nothing here is computed that the dashboard didn't already compute -- these
// nine counts used to live as badges (or as no badge at all) across six
// different tabs, so the answer to "am I done for the day?" was a tour of the
// sidebar. Each row links to the screen where that work is actually done,
// rather than trying to do it inline: an inbox that also edits is a second
// implementation of every screen it links to.

export type InboxItem = {
  label: string;
  count: number;
  section: AdminSectionKey;
  tab: string;
  /** Why this matters / what to do -- one short line. */
  hint: string;
  /** Money at stake, real exposure rather than a queue. Renders red. */
  urgent?: boolean;
};

export type InboxGroup = {
  title: string;
  icon: string;
  items: InboxItem[];
};

export default function AdminTodayTab({
  groups,
  todayCount,
  unassignedTodayCount,
  allowedSections,
}: {
  groups: InboxGroup[];
  todayCount: number;
  unassignedTodayCount: number;
  // A limited-scope admin never sees a row pointing at a screen they can't
  // open -- an inbox full of dead ends is worse than a shorter inbox.
  allowedSections: AdminSectionKey[];
}) {
  const visibleGroups = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => i.count > 0 && allowedSections.includes(i.section)),
    }))
    .filter((g) => g.items.length > 0);

  const total = visibleGroups.reduce(
    (sum, g) => sum + g.items.reduce((s, i) => s + i.count, 0),
    0
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Waiting on you
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900 tabular-nums">{total}</p>
          <p className="mt-1 text-[11px] text-slate-400">
            {total === 0 ? "Nothing needs attention." : "Items across every queue."}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Sessions today
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900 tabular-nums">{todayCount}</p>
          <p className="mt-1 text-[11px] text-slate-400">Scheduled for today, any mode.</p>
        </div>
        <div
          className={`rounded-2xl border bg-white p-5 shadow-sm ${
            unassignedTodayCount > 0 ? "border-red-200" : "border-slate-200"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Unassigned today
          </p>
          <p
            className={`mt-2 text-3xl font-bold tabular-nums ${
              unassignedTodayCount > 0 ? "text-red-600" : "text-slate-900"
            }`}
          >
            {unassignedTodayCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {unassignedTodayCount > 0 ? "Nobody is going to run these." : "All covered."}
          </p>
        </div>
      </div>

      {visibleGroups.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <i className="fa-solid fa-circle-check text-2xl text-teal-600"></i>
          <p className="mt-3 text-sm font-bold text-slate-800">Inbox clear</p>
          <p className="mt-1 text-xs text-slate-500">
            No approvals, requests or failures are waiting.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visibleGroups.map((group) => (
            <div
              key={group.title}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
                <i className={`fa-solid ${group.icon} text-slate-400`}></i>
                {group.title}
              </h2>
              <ul className="space-y-1.5">
                {group.items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={adminScreenHref(item.section, item.tab)}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-2.5 transition hover:border-teal-300 hover:bg-teal-50/40"
                    >
                      <span
                        className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums ${
                          item.urgent
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {item.count}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-slate-800">{item.label}</span>
                        <span className="block text-[11px] text-slate-500">{item.hint}</span>
                      </span>
                      <i className="fa-solid fa-chevron-right text-[10px] text-slate-300"></i>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
