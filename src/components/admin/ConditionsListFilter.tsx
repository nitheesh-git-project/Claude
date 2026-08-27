"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CONDITION_SPECIALTIES, type ConditionSpecialty } from "@/lib/conditionSpecialty";
// One set of status words, shared with the detail screen one click away --
// this file used to re-declare its own ("Draft" vs "Draft — not submitted").
import { CONDITION_STATUS_LABEL, type ConditionProfileStatus } from "@/lib/conditionIntake";

const CONDITION_STATUS_STYLE: Record<string, string> = {
  not_started: "bg-slate-100 text-slate-500",
  draft: "bg-slate-100 text-slate-500",
  pending_review: "bg-amber-100 text-amber-700",
  active: "bg-emerald-100 text-emerald-700",
};
// "Waiting for a therapist to onboard them" is a state of its own, not
// one of the four stored statuses -- the row may not even exist yet. It
// is the admin's version of the therapist's onboarding queue, and the
// operational question this whole feature creates: who has nobody
// written a record for?
const STATUS_OPTIONS = [
  "all",
  "awaiting_onboarding",
  "not_started",
  "draft",
  "pending_review",
  "active",
] as const;
const SPECIALTY_OPTIONS = ["all", ...CONDITION_SPECIALTIES.map((s) => s.key)] as const;
type SortKey = "name" | "status" | "updated";

type Row = {
  id: string;
  full_name: string;
  email: string;
  status: string;
  updatedAt: string | null;
  specialty: ConditionSpecialty;
  /** False until a therapist has actually written a record -- not merely
   *  "the specialty column is null", which it never is (it defaults to
   *  ortho, and an autosaved draft creates the row early). */
  onboarded: boolean;
};

const SPECIALTY_BY_KEY = new Map(CONDITION_SPECIALTIES.map((s) => [s.key, s]));

// Search/filter/sort for the admin Patient Conditions list -- fine at a
// handful of patients as a flat list, unusable past that. All client-side
// (this list is small enough not to need server-side pagination yet).
export default function ConditionsListFilter({ rows }: { rows: Row[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>("all");
  const [specialtyFilter, setSpecialtyFilter] =
    useState<(typeof SPECIALTY_OPTIONS)[number]>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) =>
        statusFilter === "all"
          ? true
          : statusFilter === "awaiting_onboarding"
            ? !r.onboarded
            : r.onboarded && r.status === statusFilter
      )
      // A patient nobody has onboarded has no meaningful specialty yet --
      // the column reads ortho by default, and filtering them in under it
      // would put them in a bucket nobody has put them in.
      .filter((r) => specialtyFilter === "all" || (r.onboarded && r.specialty === specialtyFilter))
      .filter((r) => !q || r.full_name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sortKey === "name") return a.full_name.localeCompare(b.full_name);
        if (sortKey === "status") return a.status.localeCompare(b.status);
        // "updated" -- oldest/never-updated first, so stale pending items surface at the top.
        return (a.updatedAt ? new Date(a.updatedAt).getTime() : 0) - (b.updatedAt ? new Date(b.updatedAt).getTime() : 0);
      });
  }, [rows, query, statusFilter, specialtyFilter, sortKey]);

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
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="p-2 rounded-lg border border-slate-300 text-sm"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "all"
                ? "All statuses"
                : s === "awaiting_onboarding"
                  ? "Needs onboarding"
                  : CONDITION_STATUS_LABEL[s as ConditionProfileStatus]}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by condition type"
          value={specialtyFilter}
          onChange={(e) => setSpecialtyFilter(e.target.value as typeof specialtyFilter)}
          className="p-2 rounded-lg border border-slate-300 text-sm"
        >
          {SPECIALTY_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All condition types" : SPECIALTY_BY_KEY.get(s)?.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Sort by"
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
                <span className="flex shrink-0 items-center gap-1.5">
                  {r.onboarded && SPECIALTY_BY_KEY.has(r.specialty) && (
                    <span
                      className={`rounded-full border px-2 py-1 text-[11px] font-bold ${SPECIALTY_BY_KEY.get(r.specialty)!.chipClass}`}
                    >
                      {SPECIALTY_BY_KEY.get(r.specialty)!.label}
                    </span>
                  )}
                  {r.onboarded ? (
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${CONDITION_STATUS_STYLE[r.status] ?? CONDITION_STATUS_STYLE.not_started}`}
                    >
                      {CONDITION_STATUS_LABEL[r.status as ConditionProfileStatus] ?? "Not started"}
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                      Awaiting onboarding
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
