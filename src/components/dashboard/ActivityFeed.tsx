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
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
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
  if (items.length === 0) {
    return (
      <EmptyState
        icon="fa-bell"
        title="Nothing new"
        body={emptyBody ?? "Updates about your account show up here as they happen."}
      />
    );
  }

  const needsYou = items.filter((i) => i.needsYou);
  const rest = items.filter((i) => !i.needsYou);
  const ordered = [...needsYou, ...rest];
  const waiting = countNeedsYou(items);

  return (
    <div>
      {waiting > 0 && (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          <i aria-hidden className="fa-solid fa-circle-exclamation text-[11px]" />
          {waiting} {waiting === 1 ? "thing needs" : "things need"} you
        </p>
      )}
      <ul className="space-y-1">
        {ordered.map((item) => {
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
              <span className="shrink-0 text-[11px] text-slate-400">{when(item.at)}</span>
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
    </div>
  );
}
