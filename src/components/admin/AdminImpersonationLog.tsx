"use client";

import { useMemo, useState } from "react";
import ListPager from "@/components/dashboard/ListPager";
import DateField from "@/components/system/DateField";
import { usePagedList } from "@/lib/usePagedList";
import { formatClinicDateTime, formatClinicTime } from "@/lib/formatDateTime";
import {
  EMPTY_IMPERSONATION_FILTERS,
  describeImpersonatedAction,
  filterImpersonationLog,
  type ImpersonationFilters,
  type ImpersonationLogEntry,
} from "@/lib/impersonationLog";

/**
 * Logs -> Signed in as: every time an admin opened somebody's dashboard as
 * them -- who, whose, the reason they typed, when, for how long, and each
 * change made while inside. Filters by admin, by the kind of account, by
 * words in the name or the reason, by day, and to only the windows in which
 * something was changed. Rules: src/lib/impersonationLog.ts.
 */

const ROLE_LABEL = { patient: "Patient", therapist: "Therapist", hospital: "Hospital" } as const;
const STATUS = {
  open: { label: "Still open", className: "bg-amber-100 text-amber-800" },
  ended: { label: "Exited", className: "bg-slate-100 text-slate-700" },
  expired: { label: "Timed out", className: "bg-slate-100 text-slate-700" },
} as const;

const control =
  "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20";

export default function AdminImpersonationLog({
  entries,
  truncated,
  actionsUnavailable,
}: {
  entries: ImpersonationLogEntry[];
  truncated: boolean;
  actionsUnavailable: boolean;
}) {
  const [filters, setFilters] = useState<ImpersonationFilters>(EMPTY_IMPERSONATION_FILTERS);
  const [openId, setOpenId] = useState<string | null>(null);
  const admins = useMemo(
    () =>
      [...new Map(entries.map((e) => [e.adminId, e.adminName])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [entries]
  );
  const filtered = useMemo(() => filterImpersonationLog(entries, filters), [entries, filters]);
  const { rows, pager } = usePagedList(filtered, {
    storageKey: "admin-impersonation-log",
    resetKey: JSON.stringify(filters),
  });
  const set = (patch: Partial<ImpersonationFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const anyFilter = JSON.stringify(filters) !== JSON.stringify(EMPTY_IMPERSONATION_FILTERS);

  return (
    <div className="space-y-4" data-testid="impersonation-log">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="font-display text-lg font-bold text-slate-800">Signed in as</h2>
        <p className="mt-1 text-sm text-slate-600">
          Every time an admin opened somebody&apos;s dashboard as them, with the reason they gave and every change
          they made while inside. Nobody can edit this record.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="imp-q" className="mb-1 block text-[13px] font-semibold text-slate-700">
              Name or reason
            </label>
            <input
              id="imp-q"
              type="search"
              value={filters.query}
              onChange={(e) => set({ query: e.target.value })}
              placeholder="Search a name or the reason"
              className={control}
            />
          </div>
          <div>
            <label htmlFor="imp-admin" className="mb-1 block text-[13px] font-semibold text-slate-700">
              Admin
            </label>
            <select id="imp-admin" value={filters.adminId} onChange={(e) => set({ adminId: e.target.value })} className={control}>
              <option value="">Every admin</option>
              {admins.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="imp-role" className="mb-1 block text-[13px] font-semibold text-slate-700">
              Whose dashboard
            </label>
            <select
              id="imp-role"
              value={filters.role}
              onChange={(e) => set({ role: e.target.value as ImpersonationFilters["role"] })}
              className={control}
            >
              <option value="">Any account</option>
              <option value="patient">Patients</option>
              <option value="therapist">Therapists</option>
              <option value="hospital">Hospitals</option>
            </select>
          </div>
          <div>
            <span className="mb-1 block text-[13px] font-semibold text-slate-700">From</span>
            <DateField value={filters.from} onChange={(v) => set({ from: v })} ariaLabel="From date" maxToday />
          </div>
          <div>
            <span className="mb-1 block text-[13px] font-semibold text-slate-700">To</span>
            <DateField value={filters.to} onChange={(v) => set({ to: v })} ariaLabel="To date" maxToday />
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 self-end text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={filters.onlyWithChanges}
              onChange={(e) => set({ onlyWithChanges: e.target.checked })}
              className="h-[18px] w-[18px] accent-teal-700"
            />
            Only where something was changed
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <span role="status">
            {filtered.length} of {entries.length} {entries.length === 1 ? "time" : "times"}
          </span>
          {anyFilter && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_IMPERSONATION_FILTERS)}
              className="min-h-10 rounded-xl px-3 font-semibold text-teal-700 hover:bg-teal-50"
            >
              Clear filters
            </button>
          )}
        </div>
        {truncated && (
          <p className="mt-2 text-xs text-slate-600">Showing the newest 1,000. Older ones are in Logs &rarr; All Activity.</p>
        )}
        {actionsUnavailable && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            The changes made inside each window couldn&apos;t be loaded just now, so none are listed below.
          </p>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          {entries.length === 0 ? "No admin has signed in as anybody yet." : "Nothing matches these filters."}
        </div>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((e) => {
            const open = openId === e.id;
            return (
              <li key={e.id} data-testid="impersonation-row" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="font-semibold text-slate-900 [overflow-wrap:anywhere]">
                      {e.adminName} <span className="font-normal text-slate-600">signed in as</span> {e.targetName}
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 align-middle text-xs font-semibold text-slate-700">
                        {ROLE_LABEL[e.targetRole]}
                      </span>
                    </p>
                    <p className="mt-1.5 text-sm text-slate-700 [overflow-wrap:anywhere]">
                      <span className="font-semibold">Reason:</span> {e.reason}
                    </p>
                  </div>
                  <div className="shrink-0 text-sm text-slate-600 sm:text-right">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS[e.status].className}`}>
                      {STATUS[e.status].label}
                    </span>
                    <p className="mt-1">{formatClinicDateTime(e.startedAt)}</p>
                    <p>
                      {e.minutes === null
                        ? "Open now"
                        : `${e.minutes} min${e.minutes === 1 ? "" : "s"}${e.endedAt ? `, until ${formatClinicTime(e.endedAt)}` : ""}`}
                    </p>
                  </div>
                </div>
                <div className="mt-2">
                  {e.actions.length === 0 ? (
                    <p className="text-xs text-slate-600">Looked only. Nothing was changed.</p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : e.id)}
                      aria-expanded={open}
                      className="min-h-10 rounded-xl px-2 text-sm font-semibold text-teal-700 hover:bg-teal-50"
                    >
                      {open ? "Hide" : "Show"} {e.actions.length} change{e.actions.length === 1 ? "" : "s"} made inside
                    </button>
                  )}
                  {open && (
                    <ol className="mt-2 space-y-1 border-l-2 border-slate-200 pl-3 text-sm text-slate-700">
                      {e.actions.map((a, i) => (
                        <li key={i}>
                          <span className="font-mono text-xs text-slate-600">{formatClinicTime(a.at)}</span>{" "}
                          {describeImpersonatedAction(a.path, a.method)}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {filtered.length > 0 && <ListPager pager={pager} noun="time" nounPlural="times" />}
    </div>
  );
}
