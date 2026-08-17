"use client";

import { useMemo, useState } from "react";
import DownloadCsvButton from "@/components/admin/DownloadCsvButton";
import { toCsv } from "@/lib/csvExport";
import { ADMIN_ACTIVITY_LABELS, isMoneyAction } from "@/lib/adminActivityLog";

// Who did what. Read-only by construction: admin_activity_log has a select
// policy and no insert/update/delete policy at all, so the only writer is
// the service-role client inside the API routes -- nothing on this screen,
// and nothing an admin session could call, can edit history.

export type ActivityRow = {
  id: string;
  actorName: string;
  action: string;
  targetLabel: string | null;
  amountPaise: number | null;
  details: Record<string, unknown> | null;
  createdAt: string;
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function describe(action: string) {
  return ADMIN_ACTIVITY_LABELS[action as keyof typeof ADMIN_ACTIVITY_LABELS] ?? action;
}

export default function AdminActivityLogTab({
  rows,
  actors,
}: {
  rows: ActivityRow[];
  actors: { id: string; name: string }[];
}) {
  const [actorFilter, setActorFilter] = useState("all");
  const [moneyOnly, setMoneyOnly] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const csv = toCsv(filtered, [
    { header: "When", value: (r) => r.createdAt },
    { header: "Admin", value: (r) => r.actorName },
    { header: "Action", value: (r) => describe(r.action) },
    { header: "Subject", value: (r) => r.targetLabel ?? "" },
    { header: "Amount (INR)", value: (r) => (r.amountPaise ? (r.amountPaise / 100).toFixed(2) : "") },
    { header: "Details", value: (r) => (r.details ? JSON.stringify(r.details) : "") },
  ]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-lg text-slate-800">Activity Log</h2>
          <p className="mt-1 text-xs text-slate-500">
            Every action an admin took from this dashboard. Append-only — nothing here can be
            edited or deleted from the app.
          </p>
        </div>
        <DownloadCsvButton
          filename="admin-activity.csv"
          csv={csv}
          disabled={filtered.length === 0}
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
          Nothing logged yet. Entries appear here as admins act.
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
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50"
                >
                  <td className="whitespace-nowrap py-2 pr-3 text-slate-500">
                    {formatWhen(r.createdAt)}
                  </td>
                  <td className="py-2 pr-3 font-semibold text-slate-800">{r.actorName}</td>
                  <td className="py-2 pr-3 text-slate-700">
                    {describe(r.action)}
                    {expandedId === r.id && r.details && (
                      <pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-100 p-2 text-[10px] text-slate-600">
                        {JSON.stringify(r.details, null, 2)}
                      </pre>
                    )}
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
    </div>
  );
}
