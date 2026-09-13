import Link from "next/link";
import { adminScreenHref, type AdminSectionKey } from "@/lib/adminNav";
import { buildMoneyAlerts, moneyAlertsHeadline, type MoneyAlertCounts } from "@/lib/moneyAlerts";

// The line at the top of every Money screen saying whether anything is
// wrong with the money.
//
// The section answered "how much came in", "who is owed" and "what did this
// patient pay" on three screens, and answered "is anything wrong?" on none
// of them -- an admin had to open all five and know what a wrong figure
// looked like. Cash a therapist collected a month ago and never handed over
// does not appear as a wrong number anywhere; it appears as money that is
// simply not there.
//
// A server component: everything it shows is derived from rows the dashboard
// has already loaded, and there is nothing to interact with but the links.
export default function MoneyAlertsStrip({
  counts,
  reachableSections,
}: {
  counts: MoneyAlertCounts;
  /** Sections this admin can actually open, so an item behind a closed door
   *  is dropped rather than linked into a redirect. */
  reachableSections: readonly AdminSectionKey[];
}) {
  const alerts = buildMoneyAlerts(counts, reachableSections);

  if (alerts.length === 0) {
    return (
      <div className="mb-5 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
        <i aria-hidden className="fa-solid fa-circle-check text-sm text-emerald-600" />
        <p className="text-xs font-semibold text-emerald-900">
          Nothing in Money needs you - no cash to chase, no refunds to hand back.
        </p>
      </div>
    );
  }

  const anyUrgent = alerts.some((a) => a.urgent);

  return (
    <div
      className={`mb-5 rounded-2xl border p-4 shadow-sm sm:p-5 ${
        anyUrgent ? "border-amber-300 bg-amber-50/70" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center gap-2">
        <i
          aria-hidden
          className={`fa-solid ${anyUrgent ? "fa-triangle-exclamation text-amber-600" : "fa-inbox text-slate-400"} text-sm`}
        />
        <h2 className="font-display text-sm font-bold text-slate-800">
          {moneyAlertsHeadline(alerts)}
        </h2>
      </div>
      <ul className="mt-3 space-y-2">
        {alerts.map((alert) => (
          <li key={alert.key}>
            <Link
              href={adminScreenHref(alert.section, alert.tab, alert.view)}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 transition hover:border-teal-300 hover:bg-teal-50/40"
            >
              <span
                className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                  alert.urgent ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
                }`}
              >
                {alert.count}
              </span>
              <span className="text-xs font-semibold text-slate-800">{alert.label}</span>
              <span className="min-w-0 flex-1 text-[11px] text-slate-500">{alert.hint}</span>
              <i aria-hidden className="fa-solid fa-arrow-right text-[10px] text-slate-300" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
