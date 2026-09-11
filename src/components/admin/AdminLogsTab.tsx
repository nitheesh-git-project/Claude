"use client";

import { useMemo, useRef, useState } from "react";
import DataExportButtons from "@/components/admin/DataExportButtons";
import ListPager from "@/components/dashboard/ListPager";
import Spinner from "@/components/system/Spinner";
import { usePagedList } from "@/lib/usePagedList";
import type { CsvColumn } from "@/lib/csvExport";
import type { ActivityRow } from "@/components/admin/AdminActivityLogTab";
import ActivityDetailDialog, {
  describeAction,
  formatWhen,
} from "@/components/admin/ActivityDetailDialog";
import {
  EMPTY_ACTIVITY_FILTERS,
  activityCategoriesPresent,
  activityCategory,
  activityCategoryLabel,
  filterActivityRows,
  type ActivityFilters,
} from "@/lib/activityLog";

// The whole log, for the one reader entitled to all of it.
//
// It is the same rows the three limited desks see a slice of, and the same
// detail dialog -- an entry has to read one way wherever it is opened. What
// this screen adds is everything that only matters once the table is long:
// a search over the words somebody would actually type, a category taken
// from the section each action's route guards with, and older pages fetched
// on demand rather than carried in every admin's dashboard render.

const LOADED_NOTE =
  "Filters, the count and both exports run over everything loaded here — load older entries first if you are looking further back.";

export default function AdminLogsTab({
  rows,
  actors,
}: {
  /** The newest entries, from the dashboard's own render. */
  rows: ActivityRow[];
  actors: { id: string; name: string }[];
}) {
  const [filters, setFilters] = useState<ActivityFilters>(EMPTY_ACTIVITY_FILTERS);
  const [older, setOlder] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // `hasMore` starts optimistic: a full first page usually has more behind
  // it, and the first press is what settles it.
  const [hasMore, setHasMore] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  // A synchronous guard, because a `disabled` attribute lands a render too
  // late -- the same rule the suggestion controls follow.
  const loadingRef = useRef(false);

  const all = useMemo(() => [...rows, ...older], [rows, older]);
  const categories = useMemo(() => activityCategoriesPresent(all), [all]);
  const filtered = useMemo(() => filterActivityRows(all, filters), [all, filters]);

  const { rows: pageRows, pager } = usePagedList(filtered, { storageKey: "admin-logs" });

  // Resolved from the whole list rather than the current page: a realtime
  // refresh can re-filter the table under an open dialog, and an entry
  // vanishing mid-read would look like the record had been deleted.
  const openRow = openId ? all.find((r) => r.id === openId) ?? null : null;

  const filtersActive =
    filters.query.trim() !== "" ||
    filters.actorName !== "all" ||
    filters.category !== "all" ||
    filters.moneyOnly ||
    filters.fromDate !== "" ||
    filters.toDate !== "";

  const set = <K extends keyof ActivityFilters>(key: K, value: ActivityFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  async function loadOlder() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setLoadError(null);
    try {
      // The cursor is the oldest entry already on screen, not a page number:
      // rows are written to this table continuously, so an offset would skip
      // whichever entry shifted across the boundary mid-scroll.
      const oldest = all.length > 0 ? all[all.length - 1].createdAt : undefined;
      const res = await fetch("/api/admin/activity-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ before: oldest }),
      });
      const body = (await res.json()) as {
        rows?: ActivityRow[];
        hasMore?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setLoadError(body.error ?? "Could not load older entries.");
        return;
      }
      const incoming = body.rows ?? [];
      // Ids already on screen are dropped rather than appended: an entry
      // written on the boundary instant can come back in two pages, and a
      // duplicated audit row reads as the action having happened twice.
      const seen = new Set(all.map((r) => r.id));
      setOlder((prev) => [...prev, ...incoming.filter((r) => !seen.has(r.id))]);
      setHasMore(!!body.hasMore);
    } catch {
      // A request that dies on a bad connection has to say so. Swallowing it
      // leaves a button that looks like it did nothing.
      setLoadError("Could not reach the server. Please try again.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  const exportColumns: CsvColumn<ActivityRow>[] = [
    { header: "When", value: (r) => r.createdAt },
    { header: "Admin", value: (r) => r.actorName },
    { header: "Category", value: (r) => activityCategoryLabel(activityCategory(r.action)) },
    { header: "Action", value: (r) => describeAction(r.action) },
    { header: "Subject", value: (r) => r.targetLabel ?? "" },
    {
      header: "Amount (INR)",
      value: (r) => (r.amountPaise != null ? (r.amountPaise / 100).toFixed(2) : ""),
    },
    { header: "Details", value: (r) => (r.details ? JSON.stringify(r.details) : "") },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-800">All Activity</h2>
            <p className="mt-1 text-xs text-slate-500">
              Every action every admin has taken from this dashboard, newest first. Tap a
              row to read exactly what changed.
            </p>
          </div>
          <DataExportButtons
            filename="admin-logs"
            title="Admin activity log"
            subtitle="Every action an admin took from this dashboard, with the filters in view applied."
            rows={filtered}
            columns={exportColumns}
          />
        </div>

        <div className="mb-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[220px] flex-1">
              <i
                aria-hidden
                className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400"
              />
              <input
                type="search"
                value={filters.query}
                onChange={(e) => set("query", e.target.value)}
                placeholder="Search a name, a patient or an action"
                aria-label="Search the log"
                className="w-full rounded-lg border border-slate-300 bg-white p-2 pl-8 text-xs"
              />
            </label>
            <select
              value={filters.actorName}
              onChange={(e) => set("actorName", e.target.value)}
              aria-label="Filter by admin"
              className="rounded-lg border border-slate-300 bg-white p-2 text-xs"
            >
              <option value="all">Any admin</option>
              {actors.map((a) => (
                <option key={a.id} value={a.name}>
                  {a.name}
                </option>
              ))}
            </select>
            <select
              value={filters.category}
              onChange={(e) => set("category", e.target.value as ActivityFilters["category"])}
              aria-label="Filter by type"
              className="rounded-lg border border-slate-300 bg-white p-2 text-xs"
            >
              <option value="all">Any type</option>
              {/* Only the categories with entries behind them. One that can
                  only ever answer "nothing matches" reads as a fault. */}
              {categories.map((c) => (
                <option key={c} value={c}>
                  {activityCategoryLabel(c)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              From
              <input
                type="date"
                value={filters.fromDate}
                onChange={(e) => set("fromDate", e.target.value)}
                className="rounded-lg border border-slate-300 bg-white p-2 text-xs"
              />
            </label>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              To
              <input
                type="date"
                value={filters.toDate}
                onChange={(e) => set("toDate", e.target.value)}
                className="rounded-lg border border-slate-300 bg-white p-2 text-xs"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={filters.moneyOnly}
                onChange={(e) => set("moneyOnly", e.target.checked)}
              />
              Money only
            </label>
            {filtersActive && (
              <button
                type="button"
                onClick={() => setFilters(EMPTY_ACTIVITY_FILTERS)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Clear filters
              </button>
            )}
            <span className="ml-auto text-[11px] text-slate-400">
              {filtered.length} of {all.length} loaded
            </span>
          </div>
        </div>

        {all.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">
            Nothing logged yet. Entries appear here as admins act.
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">
            Nothing matches these filters. {hasMore ? "Older entries are not loaded yet." : ""}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-3 font-semibold">When</th>
                  <th className="py-2 pr-3 font-semibold">Admin</th>
                  <th className="py-2 pr-3 font-semibold">Type</th>
                  <th className="py-2 pr-3 font-semibold">Action</th>
                  <th className="py-2 pr-3 font-semibold">Subject</th>
                  <th className="py-2 pr-3 text-right font-semibold">Amount</th>
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
                    <td className="py-2 pr-3">
                      <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {activityCategoryLabel(activityCategory(r.action))}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-700">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {describeAction(r.action)}
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

        <ListPager pager={pager} noun="entry" nounPlural="entries" />

        <div className="mt-4 border-t border-slate-200 pt-4">
          {loadError && (
            <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
              {loadError}
            </p>
          )}
          {hasMore ? (
            <button
              type="button"
              onClick={loadOlder}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {loading && <Spinner />}
              {loading ? "Loading older entries…" : "Load older entries"}
            </button>
          ) : (
            <p className="text-[11px] text-slate-400">
              That is the whole log — there is nothing older to load.
            </p>
          )}
          <p className="mt-2 text-[11px] text-slate-400">{LOADED_NOTE}</p>
        </div>
      </div>

      {openRow && <ActivityDetailDialog row={openRow} onClose={() => setOpenId(null)} />}
    </div>
  );
}
