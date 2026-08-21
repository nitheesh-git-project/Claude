import Link from "next/link";
import { adminScreenHref, type AdminSectionKey, type InboxGroup } from "@/lib/adminNav";
import SurfaceCard, { EmptyState } from "@/components/dashboard/SurfaceCard";

/**
 * The queues an admin still has to work, beside the activity feed on the
 * Today screen.
 *
 * This used to be its own tab (Action Inbox) next to an Overview showing
 * the same counts as figures. Two screens answering "what needs me today"
 * meant an admin read one and missed the other, so the counts, the feed
 * and the queues are now one screen: the strip says how much, the feed
 * says what happened, this says what to open.
 */
export default function AdminInboxQueues({
  groups,
  allowedSections,
}: {
  groups: InboxGroup[];
  // A limited-scope admin never sees a row pointing at a screen they
  // cannot open -- a queue full of dead ends is worse than a shorter one.
  allowedSections: AdminSectionKey[];
}) {
  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.count > 0 && allowedSections.includes(i.section)) }))
    .filter((g) => g.items.length > 0);

  return (
    <SurfaceCard title="Queues" icon="fa-inbox" subtitle="Everything waiting on a person, grouped by what it is.">
      {visibleGroups.length === 0 ? (
        <EmptyState
          icon="fa-circle-check"
          title="Every queue is clear"
          body="No approvals, change requests, unassigned sessions or failed syncs are waiting."
        />
      ) : (
        <div className="space-y-4">
          {visibleGroups.map((group) => (
            <div key={group.title}>
              <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <i aria-hidden className={`fa-solid ${group.icon} text-[10px]`} />
                {group.title}
              </p>
              <ul className="space-y-1.5">
                {group.items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={adminScreenHref(item.section, item.tab)}
                      className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition hover:bg-teal-50/40 ${
                        item.urgent ? "border-red-200 bg-red-50/40" : "border-slate-200 hover:border-teal-300"
                      }`}
                    >
                      <span
                        className={`min-w-[1.75rem] rounded-lg px-2 py-1 text-center text-xs font-bold tabular-nums ${
                          item.urgent ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {item.count}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-800">{item.label}</span>
                        {item.hint && <span className="block text-[11px] text-slate-500">{item.hint}</span>}
                      </span>
                      <i aria-hidden className="fa-solid fa-arrow-right text-[11px] text-slate-300" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </SurfaceCard>
  );
}
