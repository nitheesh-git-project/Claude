"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DataExportButtons from "@/components/admin/DataExportButtons";
import ListPager from "@/components/dashboard/ListPager";
import StatStrip from "@/components/dashboard/StatStrip";
import { FeedbackBody, StarRow } from "@/components/feedback/RatingDisplay";
import { useConfirm } from "@/lib/useConfirm";
import { usePagedList } from "@/lib/usePagedList";
import { formatClinicDateTime } from "@/lib/formatDateTime";
import type { CsvColumn } from "@/lib/csvExport";
import {
  NO_FILTERS,
  filterRatings,
  summariseRatings,
  type RatingFilters,
  type SessionRatingRow,
} from "@/lib/sessionRatings";

// Sessions -> Ratings & feedback. Every rating either side has given on a
// session, in full: the stars, the picks and the note, who gave it and about
// whom, and every id an admin could need to chase the rest (session code,
// patient and therapist codes, the underlying ids, contact details). The
// All Sessions table shows the same ratings as chips; this is the screen to
// read them on, filter them, export them and set one aside.

const selectCls = "min-h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs";

const exportColumns: CsvColumn<SessionRatingRow>[] = [
  { header: "Rated at", value: (r) => (r.submittedAt ? formatClinicDateTime(r.submittedAt) : "") },
  { header: "Rating given by", value: (r) => (r.side === "patient" ? "Patient" : "Therapist") },
  { header: "Stars", value: (r) => r.rating },
  { header: "Counted in average", value: (r) => (r.excluded ? "No" : "Yes") },
  { header: "Feedback", value: (r) => r.feedback ?? "" },
  { header: "Session ID", value: (r) => r.sessionCode ?? "" },
  { header: "Session record ID", value: (r) => r.appointmentId },
  { header: "Session time", value: (r) => (r.slotTime ? formatClinicDateTime(r.slotTime) : "") },
  { header: "Status", value: (r) => r.status ?? "" },
  { header: "Mode", value: (r) => (r.visitMode === "home_visit" ? "Home visit" : "Online") },
  { header: "Treatment", value: (r) => r.treatment ?? "" },
  { header: "Patient ID", value: (r) => r.patient.code ?? "" },
  { header: "Patient record ID", value: (r) => r.patient.id },
  { header: "Patient", value: (r) => r.patient.name ?? "" },
  { header: "Patient email", value: (r) => r.patient.email ?? "" },
  { header: "Patient phone", value: (r) => r.patient.phone ?? "" },
  { header: "Therapist ID", value: (r) => r.therapist.code ?? "" },
  { header: "Therapist record ID", value: (r) => r.therapist.id ?? "" },
  { header: "Therapist", value: (r) => r.therapist.name ?? "" },
  { header: "Therapist email", value: (r) => r.therapist.email ?? "" },
  { header: "Therapist phone", value: (r) => r.therapist.phone ?? "" },
];

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; rows: SessionRatingRow[]; truncated: boolean };

export default function AdminRatingsTab({ canManageSessions }: { canManageSessions: boolean }) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [filters, setFilters] = useState<RatingFilters>(NO_FILTERS);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const fetchRows = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/session-ratings", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoad({ state: "error", message: data.error ?? "Could not load the ratings." });
        return;
      }
      setLoad({ state: "ready", rows: data.rows ?? [], truncated: !!data.truncated });
    } catch {
      setLoad({ state: "error", message: "Could not reach the server. Check your connection and try again." });
    }
  }, []);

  useEffect(() => {
    // The fetch's setState runs after an await, not synchronously in the effect.
    void fetchRows();
  }, [fetchRows]);

  const all = useMemo(() => (load.state === "ready" ? load.rows : []), [load]);
  const shown = useMemo(() => filterRatings(all, filters), [all, filters]);
  const summary = useMemo(() => summariseRatings(shown), [shown]);
  const { rows: pageRows, pager } = usePagedList(shown, { storageKey: "admin-ratings", defaultPageSize: 10 });
  const set = (patch: Partial<RatingFilters>) => setFilters((f) => ({ ...f, ...patch }));

  async function post(path: string, row: SessionRatingRow, extra: Record<string, unknown>) {
    setActionError(null);
    setBusyKey(row.key);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: row.appointmentId, role: row.side, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error ?? "That did not work. Try again.");
        return;
      }
      await fetchRows();
    } finally {
      setBusyKey(null);
    }
  }

  async function clear(row: SessionRatingRow) {
    const who = row.side === "patient" ? "patient" : "therapist";
    if (!(await confirm(`Clear the ${who}'s rating so they can submit it again? The stars and note on this card are removed.`))) return;
    await post("/api/admin/clear-session-rating", row, {});
  }

  const hasFilters = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  return (
    <div>
      {dialog}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-800">
            Ratings &amp; feedback
            {load.state === "ready" && (
              <span className="ml-2 text-xs font-normal text-slate-500">
                {shown.length} of {all.length}
              </span>
            )}
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-500">
            Every rating a patient or a therapist has left on a session, with the stars, the quick picks and the note, who left
            it and who it is about, and the IDs to find the rest.
          </p>
        </div>
        <DataExportButtons
          filename="ratings-and-feedback"
          title="Ratings and feedback"
          subtitle="Every rating passing the filters in view, with the patient, therapist and session IDs."
          rows={shown}
          columns={exportColumns}
          disabled={load.state !== "ready" || shown.length === 0}
        />
      </div>

      {load.state === "loading" && <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading ratings...</p>}

      {load.state === "error" && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>{load.message}</p>
          <button
            type="button"
            onClick={() => {
              setLoad({ state: "loading" });
              void fetchRows();
            }}
            className="mt-2 min-h-9 rounded-lg border border-red-300 bg-white px-3 text-xs font-semibold text-red-800 hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      )}

      {load.state === "ready" && (
        <>
          <div className="mb-4">
            <StatStrip
              cells={[
                {
                  label: "Average",
                  value: summary.average === null ? "-" : summary.average.toFixed(1),
                  unit: summary.average === null ? undefined : "/ 5",
                  note: summary.excluded > 0 ? `${summary.excluded} set aside, not counted` : "Ratings in view",
                  accent: "bg-amber-400",
                },
                { label: "Ratings", value: String(summary.count), note: `${summary.withNote} with written feedback`, accent: "bg-teal-500" },
                {
                  label: "1-2 stars",
                  value: String(summary.lowCount),
                  note: summary.lowCount ? "Worth a look" : "None in view",
                  accent: "bg-red-400",
                  selected: filters.stars === -1,
                  onSelect: () => set({ stars: filters.stars === -1 ? 0 : -1 }),
                },
              ]}
            />
          </div>

          {load.truncated && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Showing the latest 2,000 rated sessions. Narrow with the filters or download from All Sessions for older ones.
            </p>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <input
              type="search"
              aria-label="Search ratings by patient, therapist, session ID, patient ID, therapist ID or words in the feedback"
              placeholder="Search name, session ID, patient ID, therapist ID, feedback"
              title="A name, an email or phone, a session ID such as SS0004, a patient ID such as PT0001, a therapist ID such as TH0002, or a word from the feedback."
              value={filters.query}
              onChange={(e) => set({ query: e.target.value })}
              className="min-h-9 w-full rounded-lg border border-slate-300 p-2 text-xs sm:w-80"
            />
            <select aria-label="Filter by who rated" value={filters.side} onChange={(e) => set({ side: e.target.value as RatingFilters["side"] })} className={selectCls}>
              <option value="all">Patients and therapists</option>
              <option value="patient">Left by patients</option>
              <option value="therapist">Left by therapists</option>
            </select>
            <select aria-label="Filter by stars" value={filters.stars} onChange={(e) => set({ stars: Number(e.target.value) })} className={selectCls}>
              <option value={0}>Any stars</option>
              <option value={-1}>1-2 stars</option>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "star" : "stars"}
                </option>
              ))}
            </select>
            <select aria-label="Filter by whether it counts" value={filters.counting} onChange={(e) => set({ counting: e.target.value as RatingFilters["counting"] })} className={selectCls}>
              <option value="all">Counted and set aside</option>
              <option value="counted">Counted in the average</option>
              <option value="excluded">Set aside</option>
            </select>
            <label className="flex min-h-9 items-center gap-1.5 text-xs font-semibold text-slate-600">
              <input type="checkbox" checked={filters.withNote} onChange={(e) => set({ withNote: e.target.checked })} />
              With feedback only
            </label>
            {hasFilters && (
              <button type="button" onClick={() => setFilters(NO_FILTERS)} className="min-h-9 rounded-lg px-2 text-xs font-semibold text-teal-700 hover:bg-teal-50">
                Clear filters
              </button>
            )}
          </div>

          {actionError && (
            <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
              {actionError}
            </p>
          )}

          {shown.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              {all.length === 0
                ? "No ratings yet. They appear here as soon as a patient or a therapist rates a completed session."
                : "No ratings match these filters."}
            </p>
          ) : (
            <ul className="space-y-3" aria-label="Ratings">
              {pageRows.map((r) => (
                <RatingCard key={r.key} row={r} canManage={canManageSessions} busy={busyKey === r.key} onExclude={(next) => post("/api/admin/exclude-session-rating", r, { excluded: next })} onClear={() => clear(r)} />
              ))}
            </ul>
          )}
          <ListPager pager={pager} noun="rating" />
        </>
      )}
    </div>
  );
}

function Id({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
      <span className="font-sans font-semibold text-slate-500">{label}</span>
      <span className="break-all select-all">{value}</span>
    </span>
  );
}

function Person({ title, p, code }: { title: string; p: SessionRatingRow["patient"] | SessionRatingRow["therapist"]; code: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-0.5 truncate text-sm font-bold text-slate-800">{p.name ?? "Not assigned"}</p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <Id label={code} value={p.code} />
        <Id label="Record" value={p.id} />
      </div>
      {(p.email || p.phone) && (
        <p className="mt-1.5 break-all text-[11px] text-slate-500">{[p.email, p.phone].filter(Boolean).join(" · ")}</p>
      )}
    </div>
  );
}

function RatingCard({
  row: r,
  canManage,
  busy,
  onExclude,
  onClear,
}: {
  row: SessionRatingRow;
  canManage: boolean;
  busy: boolean;
  onExclude: (excluded: boolean) => void;
  onClear: () => void;
}) {
  const byPatient = r.side === "patient";
  return (
    <li className={`rounded-xl border p-4 ${r.excluded ? "border-amber-200 bg-amber-50/60" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StarRow rating={r.rating} size={16} />
          <span className="font-display text-sm font-bold text-slate-900">{r.rating.toFixed(1)}</span>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${byPatient ? "bg-teal-50 text-teal-800" : "bg-indigo-50 text-indigo-800"}`}>
            {byPatient ? "Patient rated the session" : "Therapist rated the patient"}
          </span>
          {r.excluded && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">Set aside, not in the average</span>}
        </div>
        <p className="text-[11px] text-slate-500">{r.submittedAt ? `Rated ${formatClinicDateTime(r.submittedAt)}` : "Rating time not recorded"}</p>
      </div>

      <div className="mt-3">
        <FeedbackBody feedback={r.feedback} tone={r.excluded ? "amber" : "teal"} />
        {!r.feedback?.trim() && <p className="text-xs text-slate-400">No written feedback.</p>}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Person title={byPatient ? "Rated by, patient" : "About, patient"} p={r.patient} code="Patient ID" />
        <Person title={byPatient ? "About, therapist" : "Rated by, therapist"} p={r.therapist} code="Therapist ID" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-600">
        <Id label="Session ID" value={r.sessionCode} />
        <Id label="Record" value={r.appointmentId} />
        {r.slotTime && <span>{formatClinicDateTime(r.slotTime)}</span>}
        <span>· {r.visitMode === "home_visit" ? "Home visit" : "Online"}</span>
        {r.treatment && <span>· {r.treatment}</span>}
        {r.durationMinutes && <span>· {r.durationMinutes} min</span>}
        {r.status && <span className="capitalize">· {r.status}</span>}
      </div>

      {canManage && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onExclude(!r.excluded)}
            className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {r.excluded ? "Include in average" : "Exclude from average"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClear}
            className="min-h-9 rounded-lg px-3 text-[11px] font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
          >
            Clear so they can rate again
          </button>
        </div>
      )}
    </li>
  );
}
