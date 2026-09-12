"use client";

import { useMemo, useState } from "react";
import DataExportButtons from "@/components/admin/DataExportButtons";
import ListPager from "@/components/dashboard/ListPager";
import { usePagedList } from "@/lib/usePagedList";
import type { CsvColumn } from "@/lib/csvExport";
import { isMoneyAction } from "@/lib/adminActivityLog";
import type { AdminScope } from "@/lib/adminScope";
import ActivityDetailDialog, {
  describeAction,
  formatWhen,
} from "@/components/admin/ActivityDetailDialog";

// Who did what, for one desk.
//
// A limited scope's own screen, on Today -> Activity: Operations, Finance
// and Clinical cannot open the Logs section, and the rows reaching this
// component were already filtered to their desk by activityScope.ts. A
// Master Admin reads the whole log on Logs -> All Activity instead, which is
// the same entries with a search, a category filter and older pages behind
// it.
//
// Read-only by construction: admin_activity_log has a select policy and no
// insert or update policy at all, so the only writer is the service-role
// client inside the API routes -- nothing on this screen, and nothing an
// admin session could call, can edit history.

export type ActivityRow = {
  id: string;
  actorName: string;
  action: string;
  /** The row this acted on, when the route named one. It is the id rather
   *  than the label that identifies a subject: the label is a snapshot taken
   *  at write time, so two entries about one patient can carry two different
   *  names if it was changed in between. */
  targetId: string | null;
  targetLabel: string | null;
  amountPaise: number | null;
  details: Record<string, unknown> | null;
  createdAt: string;
  /** Which desk the acting admin sits at. Carried so the page can filter
   *  before this screen renders; nothing here reads it. */
  actorScope: AdminScope | null;
};

export default function AdminActivityLogTab({
  rows,
  actors,
  scopeNote,
}: {
  rows: ActivityRow[];
  actors: { id: string; name: string }[];
  /** What this reader is seeing, when it is not everything. A filtered list
   *  that looks complete is worse than one that says what it is -- an
   *  Operations admin reading "Nothing logged yet" while a Master Admin has
   *  been working all morning has been told something false. */
  scopeNote?: string | null;
}) {
  const [actorFilter, setActorFilter] = useState("all");
  const [moneyOnly, setMoneyOnly] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  // The entry being read. A dialog rather than an inline expander: an audit
  // entry is a paragraph of before-and-after, and the row it belongs to is
  // five narrow columns in a table that already scrolls sideways.
  const [openId, setOpenId] = useState<string | null>(null);

  // Resolved from `rows` rather than the current page: a realtime refresh can
  // re-filter the table under an open dialog, and an entry vanishing
  // mid-read would look like the record had been deleted -- on the one
  // screen in the app whose point is that nothing here can be.
  const openRowFrom = (id: string | null) => (id ? rows.find((r) => r.id === id) ?? null : null);

  const filtered = useMemo(
    () =>
      rows
        .filter((r) => actorFilter === "all" || r.actorName === actorFilter)
        .filter((r) => !moneyOnly || isMoneyAction(r.action))
        .filter((r) => {
          if (!fromDate && !toDate) return true;
          const key = r.createdAt.slice(0, 10);
          if (fromDate && key < fromDate) return false;
          if (toDate && key > toDate) return false;
          return true;
        }),
    [rows, actorFilter, moneyOnly, fromDate, toDate]
  );

  // Filters and the export run over the whole filtered set; only what is
  // painted is paged.
  const { rows: pageRows, pager } = usePagedList(filtered, { storageKey: "admin-activity" });

  const exportColumns: CsvColumn<(typeof filtered)[number]>[] = [
    { header: "When", value: (r) => r.createdAt },
    { header: "Admin", value: (r) => r.actorName },
    { header: "Action", value: (r) => describeAction(r.action) },
    { header: "Subject", value: (r) => r.targetLabel ?? "" },
    { header: "Amount (INR)", value: (r) => (r.amountPaise ? (r.amountPaise / 100).toFixed(2) : "") },
    { header: "Details", value: (r) => (r.details ? JSON.stringify(r.details) : "") },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-lg text-slate-800">Activity Log</h2>
          <p className="mt-1 text-xs text-slate-500">
            {scopeNote
              ? "Every action your desk took from this dashboard. Append-only — nothing here can be edited."
              : "Every action an admin took from this dashboard. Append-only — nothing here can be edited."}
          </p>
          {scopeNote && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              <i aria-hidden className="fa-solid fa-filter text-[9px]" />
              {scopeNote}
            </p>
          )}
        </div>
        <DataExportButtons
          filename="admin-activity"
          title="Admin activity log"
          subtitle={
            scopeNote
              ? "Your desk's actions from this dashboard, with the filters in view applied."
              : "Every action an admin took from this dashboard, with the filters in view applied."
          }
          rows={filtered}
          columns={exportColumns}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <select
          value={actorFilter}
          onChange={(e) => setActorFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white p-2 text-xs"
        >
          <option value="all">Any admin</option>
          {actors.map((a) => (
            <option key={a.id} value={a.name}>
              {a.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
          From
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white p-2 text-xs"
          />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
          To
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white p-2 text-xs"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={moneyOnly}
            onChange={(e) => setMoneyOnly(e.target.checked)}
          />
          Money only
        </label>
        <span className="ml-auto text-[11px] text-slate-400">
          {filtered.length} of {rows.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-500">
          {scopeNote
            ? "Nothing from your desk yet. Entries appear here as your team acts."
            : "Nothing logged yet. Entries appear here as admins act."}
        </p>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-500">Nothing matches these filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 pr-3 font-semibold">When</th>
                <th className="py-2 pr-3 font-semibold">Admin</th>
                <th className="py-2 pr-3 font-semibold">Action</th>
                <th className="py-2 pr-3 font-semibold">Subject</th>
                <th className="py-2 pr-3 font-semibold text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setOpenId(r.id)}
                  className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50"
                >
                  <td className="whitespace-nowrap py-2 pr-3 text-slate-500">
                    {formatWhen(r.createdAt)}
                  </td>
                  <td className="py-2 pr-3 font-semibold text-slate-800">{r.actorName}</td>
                  <td className="py-2 pr-3 text-slate-700">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {describeAction(r.action)}
                      {/* Says the row has more behind it. Without this the
                          table looks like the whole record, and the detail
                          nobody knows about is the detail nobody reads. */}
                      {r.details && Object.keys(r.details).length > 0 && (
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                          Details
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-slate-500">{r.targetLabel ?? "—"}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right font-semibold tabular-nums text-slate-800">
                    {r.amountPaise != null
                      ? `₹${(r.amountPaise / 100).toLocaleString("en-IN")}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openRowFrom(openId) && (
        <ActivityDetailDialog row={openRowFrom(openId)!} onClose={() => setOpenId(null)} />
      )}

      <ListPager pager={pager} noun="entry" nounPlural="entries" />
    </div>
  );
}
