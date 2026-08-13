"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

const CONDITION_STATUS_STYLE: Record<string, string> = {
  not_started: "bg-slate-100 text-slate-500",
  draft: "bg-slate-100 text-slate-500",
  pending_review: "bg-amber-100 text-amber-700",
  active: "bg-emerald-100 text-emerald-700",
};
const CONDITION_STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  draft: "Draft",
  pending_review: "Pending review",
  active: "Complete",
};
const STATUS_OPTIONS = ["all", "not_started", "draft", "pending_review", "active"] as const;
type SortKey = "name" | "status" | "updated";

type Row = { id: string; full_name: string; email: string; status: string; updatedAt: string | null };

// Search/filter/sort for the admin Patient Conditions list -- fine at a
// handful of patients as a flat list, unusable past that. All client-side
// (this list is small enough not to need server-side pagination yet).
export default function ConditionsListFilter({ rows }: { rows: Row[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => statusFilter === "all" || r.status === statusFilter)
      .filter((r) => !q || r.full_name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sortKey === "name") return a.full_name.localeCompare(b.full_name);
        if (sortKey === "status") return a.status.localeCompare(b.status);
        // "updated" -- oldest/never-updated first, so stale pending items surface at the top.
        return (a.updatedAt ? new Date(a.updatedAt).getTime() : 0) - (b.updatedAt ? new Date(b.updatedAt).getTime() : 0);
      });
  }, [rows, query, statusFilter, sortKey]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or email…"
          className="flex-1 min-w-[160px] p-2 rounded-lg border border-slate-300 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="p-2 rounded-lg border border-slate-300 text-sm"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : CONDITION_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="p-2 rounded-lg border border-slate-300 text-sm"
        >
          <option value="updated">Sort: oldest updated first</option>
          <option value="name">Sort: name</option>
          <option value="status">Sort: status</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-slate-500 py-4 text-center">No patients match.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {filtered.map((r) => (
            <li key={r.id}>
              <Link
                href={`/admin/dashboard/conditions/${r.id}`}
                className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50 -mx-2 px-2 rounded-lg transition"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{r.full_name}</p>
                  <p className="text-xs text-slate-400 truncate">{r.email}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${CONDITION_STATUS_STYLE[r.status] ?? CONDITION_STATUS_STYLE.not_started}`}
                >
                  {CONDITION_STATUS_LABEL[r.status] ?? "Not started"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
