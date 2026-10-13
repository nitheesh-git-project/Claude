"use client";

import ActivityGapsNotice, { type ActivityGap } from "@/components/admin/ActivityGapsNotice";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import SubjectTimelineDialog from "@/components/admin/SubjectTimelineDialog";
import {
  EMPTY_ACTIVITY_FILTERS,
  activityCategoriesPresent,
  activityCategory,
  activityCategoryLabel,
  filterActivityRows,
  hasActivityFilters,
  parseActivityFilters,
  writeActivityFilters,
  type ActivityFilters,
} from "@/lib/activityLog";
import {
  LOG_ACTOR_ROLES,
  LOG_ROLE_LABEL,
  LOG_ROLE_TONE,
  distinctValues,
  rowRole,
} from "@/lib/userActivity";
import DateField from "@/components/system/DateField";
import { rowActivationProps } from "@/lib/rowActivation";
import { formatRupees } from "@/lib/formatMoney";

// The whole log, for the one reader entitled to all of it -- and not only
// admins' part of it. Patients, therapists, hospitals and the system leave
// entries too (user_activity_log), and this is one feed of both: each row
// carries who it was (role chip), the programme ID and session it was about,
// and the filters below run over those same fields. The filters live in the
// URL (al_* keys) so a filtered view is a link.
//
// It is the same rows the three limited desks see a slice of, and the same
// detail dialog -- an entry has to read one way wherever it is opened. What
// this screen adds is everything that only matters once the table is long:
// a search over the words somebody would actually type, a category taken
// from the section each action's route guards with, and older pages fetched
// on demand rather than carried in every admin's dashboard render.

const LOADED_NOTE =
  "Filters, the count and both exports run over everything loaded here - load older entries first if you are looking further back.";

export default function AdminLogsTab({
  rows,
  conditions,
  everyoneUnavailable = false,
  adminUnavailable = false,
  gaps = [],
  gapsTotal = 0,
}: {
  /** The newest entries, from the dashboard's own render. */
  rows: ActivityRow[];
  /** Every condition the clinic treats, so the filter offers them all and
   *  not only the ones in the entries loaded so far. */
  conditions: string[];
  /** The patients', therapists' and hospitals' half of the log could not be
   *  read. Said out loud: a feed of admins alone must not read as complete. */
  everyoneUnavailable?: boolean;
  /** The admin log could not be read (an outage, or a database without the
   *  table): what remains is everyone else's side, and the screen says so
   *  rather than passing it off as the whole history. */
  adminUnavailable?: boolean;
  /** Actions the log could not record -- see ActivityGapsNotice. */
  gaps?: ActivityGap[];
  gapsTotal?: number;
}) {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<ActivityFilters>(() => parseActivityFilters(searchParams));
  const [older, setOlder] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // `hasMore` starts optimistic: a full first page usually has more behind
  // it, and the first press is what settles it.
  const [hasMore, setHasMore] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  // The entry whose subject is being traced. Held as a whole row rather than
  // an id: a timeline can be opened from an entry fetched by the timeline
  // itself, which the loaded list may not contain.
  const [subject, setSubject] = useState<ActivityRow | null>(null);
  // An entry opened *from* a timeline. Same reason -- it may be older than
  // anything this screen has loaded, so it cannot be looked up by id.
  const [openRowFromTimeline, setOpenRowFromTimeline] = useState<ActivityRow | null>(null);
  // The timeline an entry was picked from, so that entry can offer the way
  // back to it. Held as the subject row rather than a flag: the timeline is
  // keyed on that row's target, and re-deriving it from the entry now on
  // screen would open a different record's history.
  const [timelineOrigin, setTimelineOrigin] = useState<ActivityRow | null>(null);
  // A synchronous guard, because a `disabled` attribute lands a render too
  // late -- the same rule the suggestion controls follow.
  const loadingRef = useRef(false);

  const all = useMemo(() => [...rows, ...older], [rows, older]);
  const categories = useMemo(() => activityCategoriesPresent(all), [all]);
  const filtered = useMemo(() => filterActivityRows(all, filters), [all, filters]);

  const { rows: pageRows, pager } = usePagedList(filtered, {
    storageKey: "admin-logs",
    resetKey: JSON.stringify(filters),
  });

  // Keep the URL in step while this screen is the one on show, so the
  // address bar is always a link to what is on screen. replaceState: a
  // keystroke in a search box is not a step Back should walk through.
  const onThisScreen =
    searchParams.get("section") === "logs" && (searchParams.get("tab") ?? "all") === "all";
  useEffect(() => {
    if (!onThisScreen) return;
    const params = new URLSearchParams(window.location.search);
    const before = params.toString();
    writeActivityFilters(params, filters);
    const after = params.toString();
    if (after !== before) window.history.replaceState(null, "", `${window.location.pathname}?${after}`);
  }, [filters, onThisScreen]);

  const conditionOptions = useMemo(
    () => distinctValues([...conditions, ...all.map((r) => r.conditionName)]),
    [conditions, all]
  );

  // Resolved from the whole list rather than the current page: a realtime
  // refresh can re-filter the table under an open dialog, and an entry
  // vanishing mid-read would look like the record had been deleted.
  const openRow = openRowFromTimeline ?? (openId ? all.find((r) => r.id === openId) ?? null : null);

  const closeEntry = () => {
    setOpenId(null);
    setOpenRowFromTimeline(null);
    setTimelineOrigin(null);
  };

  const filtersActive = hasActivityFilters(filters);

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
    { header: "Actor role", value: (r) => LOG_ROLE_LABEL[rowRole(r)] },
    { header: "Actor", value: (r) => r.actorName },
    { header: "Category", value: (r) => activityCategoryLabel(activityCategory(r.action)) },
    { header: "Action", value: (r) => describeAction(r.action) },
    { header: "What happened", value: (r) => r.summary ?? "" },
    { header: "Programme ID", value: (r) => r.programmeCode ?? "" },
    { header: "Session", value: (r) => r.sessionCode ?? "" },
    { header: "Patient", value: (r) => r.patientName ?? "" },
    { header: "Therapist", value: (r) => r.therapistName ?? "" },
    { header: "Condition", value: (r) => r.conditionName ?? "" },
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
        <ActivityGapsNotice gaps={gaps} total={gapsTotal} />
        {adminUnavailable && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800"
          >
            {"Admin actions couldn't be read just now, so this list shows what patients, therapists, hospitals and the system did. Nothing has been lost - reload to try again."}
          </p>
        )}
        {everyoneUnavailable && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800"
          >
            {"The patients', therapists' and hospitals' side of the log couldn't be read just now, so this list shows admin actions only. Nothing has been lost - reload to try again."}
          </p>
        )}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-800">All Activity</h2>
            <p className="mt-1 text-xs text-slate-500">
              Every action taken by admins, patients, therapists, hospitals and the
              system, newest first. Tap a row to read exactly what happened.
            </p>
          </div>
          <DataExportButtons
            filename="admin-logs"
            title="Activity log"
            subtitle="Every action by admins, patients, therapists, hospitals and the system, with the filters in view applied."
            rows={filtered}
            columns={exportColumns}
          />
        </div>

        <div className="mb-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[220px] flex-1">
              <i
                aria-hidden
                className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-500"
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
              value={filters.role}
              onChange={(e) => set("role", e.target.value as ActivityFilters["role"])}
              aria-label="Filter by actor role"
              className="rounded-lg border border-slate-300 bg-white p-2 text-xs"
            >
              <option value="">Any actor</option>
              {LOG_ACTOR_ROLES.map((role) => (
                <option key={role} value={role}>
                  {LOG_ROLE_LABEL[role]}
                </option>
              ))}
            </select>
            <input
              type="search"
              value={filters.person}
              onChange={(e) => set("person", e.target.value)}
              placeholder="Actor name"
              aria-label="Filter by actor name"
              className="w-36 rounded-lg border border-slate-300 bg-white p-2 text-xs"
            />
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
            <input
              type="search"
              value={filters.programme}
              onChange={(e) => set("programme", e.target.value)}
              placeholder="Programme ID (PED_PKG001)"
              aria-label="Filter by programme ID"
              className="w-44 rounded-lg border border-slate-300 bg-white p-2 text-xs"
            />
            <input
              type="search"
              value={filters.patient}
              onChange={(e) => set("patient", e.target.value)}
              placeholder="Patient"
              aria-label="Filter by patient"
              className="w-36 rounded-lg border border-slate-300 bg-white p-2 text-xs"
            />
            <input
              type="search"
              value={filters.therapist}
              onChange={(e) => set("therapist", e.target.value)}
              placeholder="Therapist"
              aria-label="Filter by therapist"
              className="w-36 rounded-lg border border-slate-300 bg-white p-2 text-xs"
            />
            <select
              value={filters.condition}
              onChange={(e) => set("condition", e.target.value)}
              aria-label="Filter by condition"
              className="rounded-lg border border-slate-300 bg-white p-2 text-xs"
            >
              <option value="">Any condition</option>
              {conditionOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              From
              <DateField
                value={filters.fromDate}
                onChange={(next) => set("fromDate", next)}
                ariaLabel="From date"
                className="w-36"
              />
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              To
              <DateField
                value={filters.toDate}
                onChange={(next) => set("toDate", next)}
                ariaLabel="To date"
                className="w-36"
              />
            </div>
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
            <span className="ml-auto text-[11px] text-slate-500">
              {filtered.length} of {all.length} loaded
            </span>
          </div>
        </div>

        {all.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">
            Nothing logged yet. Entries appear here as people book, treat and pay.
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
                  <th className="py-2 pr-3 font-semibold">Who</th>
                  <th className="py-2 pr-3 font-semibold">Type</th>
                  <th className="py-2 pr-3 font-semibold">Action</th>
                  <th className="py-2 pr-3 font-semibold">Programme</th>
                  <th className="py-2 pr-3 font-semibold">Patient / therapist</th>
                  <th className="py-2 pr-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr
                    key={r.id}
                    {...rowActivationProps(() => {
                      // Opened from the table, so there is no timeline
                      // behind it to go back to.
                      setTimelineOrigin(null);
                      setOpenRowFromTimeline(null);
                      setOpenId(r.id);
                    })}
                    className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-600"
                  >
                    <td className="whitespace-nowrap py-2 pr-3 text-slate-500">
                      {formatWhen(r.createdAt)}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="flex flex-col items-start gap-1">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${LOG_ROLE_TONE[rowRole(r)]}`}
                        >
                          {LOG_ROLE_LABEL[rowRole(r)]}
                        </span>
                        <span className="font-semibold text-slate-800">{r.actorName}</span>
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {activityCategoryLabel(activityCategory(r.action))}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-700">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{describeAction(r.action)}</span>
                        {r.sessionCode && (
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                            {r.sessionCode}
                          </span>
                        )}
                        {r.details && Object.keys(r.details).length > 0 && (
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                            Details
                          </span>
                        )}
                      </span>
                      {r.summary && <span className="mt-0.5 block max-w-md text-[11px] text-slate-500">{r.summary}</span>}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3">
                      {r.programmeCode ? (
                        <span className="rounded-md bg-teal-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-teal-800">
                          {r.programmeCode}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                      {r.conditionName && (
                        <span className="mt-0.5 block text-[11px] text-slate-500">{r.conditionName}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">
                      {r.patientName || r.therapistName ? (
                        <>
                          {r.patientName && <span className="block">{r.patientName}</span>}
                          {r.therapistName && (
                            <span className="block text-[11px] text-slate-500">{r.therapistName}</span>
                          )}
                        </>
                      ) : (
                        r.targetLabel ?? "-"
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right font-semibold tabular-nums text-slate-800">
                      {r.amountPaise != null
                        ? `₹${formatRupees(r.amountPaise)}`
                        : "-"}
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
            <p className="text-[11px] text-slate-500">
              That is the whole log - there is nothing older to load.
            </p>
          )}
          <p className="mt-2 text-[11px] text-slate-500">{LOADED_NOTE}</p>
        </div>
      </div>

      {/* One dialog at a time: opening a timeline closes the entry behind
          it, and picking an entry from the timeline closes the timeline.
          Two stacked modals over a table is a reader who cannot tell which
          Escape closes what. */}
      {openRow && !subject && (
        <ActivityDetailDialog
          row={openRow}
          onClose={closeEntry}
          onBack={
            timelineOrigin
              ? () => {
                  const origin = timelineOrigin;
                  closeEntry();
                  setSubject(origin);
                }
              : undefined
          }
          onOpenSubject={(r) => {
            closeEntry();
            setSubject(r);
          }}
        />
      )}

      {subject && (
        <SubjectTimelineDialog
          subject={subject}
          onClose={() => setSubject(null)}
          onBack={() => {
            // Back to the entry this timeline was opened from. Its own row
            // is the subject, so nothing has to be remembered separately.
            setSubject(null);
            setTimelineOrigin(null);
            setOpenId(subject.id);
            setOpenRowFromTimeline(subject);
          }}
          onOpenEntry={(r) => {
            setTimelineOrigin(subject);
            setSubject(null);
            setOpenId(r.id);
            setOpenRowFromTimeline(r);
          }}
        />
      )}
    </div>
  );
}
