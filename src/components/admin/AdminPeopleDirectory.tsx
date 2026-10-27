"use client";

import ListPager from "@/components/dashboard/ListPager";
import { usePagedList } from "@/lib/usePagedList";
import { useState } from "react";
import Link from "next/link";
import AvatarThumbnail from "@/components/profile/AvatarThumbnail";
import { formatClinicDateTimeWithZone } from "@/lib/formatDateTime";
import SpecialtyChip from "@/components/SpecialtyChip";
import { CONDITION_SPECIALTIES, type ConditionSpecialty } from "@/lib/conditionSpecialty";
import { matchSearchRef, SEARCH_REF_LABEL, type SearchRef } from "@/lib/paymentSearch";
import {
  SPECIALTY_FILTER_ALL,
  matchesSpecialtyFilter,
  specialtyFilterOptions,
  specialtyLabel,
} from "@/lib/therapistSpecialties";

type Person = {
  id: string;
  full_name: string | null;
  subtitle: string | null;
  avatar_url: string | null;
  active: boolean;
  approved?: boolean;
  created_at: string;
  // New/migration-dependent PT0001/TH0001-style display ID (see
  // supabase/schema.sql's "Unique display IDs" section) -- null until the
  // migration backfilling it has run.
  code?: string | null;
  // Where this patient's Health Profile has got to, when the caller has it
  // (therapists have none, so they pass nothing). Folded into the directory
  // rather than listed again on a second screen: a patient used to appear
  // twice in People -> Patients, once here and once as "Patient Conditions".
  // One of HEALTH_PROFILE_STATES below.
  careStatus?: string | null;
  // The condition type of that Health Profile (ortho, neuro, ...); null until a
  // therapist has written the first record. Patients only.
  conditionType?: ConditionSpecialty | null;
  // What this therapist is a specialist in, when the caller has it
  // (patients and partners have none, so they pass nothing). Same shape as
  // careStatus above: undefined means "this directory is not about that",
  // and the filter and the column appear only where somebody passed it.
  specialization?: string | null;
  // References that are not on the card but still identify this person:
  // Razorpay payment and order ids, session codes, programme purchase codes
  // (src/lib/paymentSearch.ts). Searched, never listed -- a card matched by
  // one shows which, so the admin can see why it is in the results.
  searchRefs?: SearchRef[];
};

// The Health Profile states a patient can be in, in the words used on the
// profile itself (conditionIntake's CONDITION_STATUS_LABEL says the same
// things). "awaiting_onboarding" is not a stored status: it is a patient no
// therapist has written a record for yet, which is the operational question
// this column answers.
const CARE_STATUS_LABELS: Record<string, string> = {
  awaiting_onboarding: "Awaiting first record",
  not_started: "Not started",
  draft: "Draft",
  pending_review: "Waiting on review",
  active: "Complete",
};

const CARE_STATUS_STYLES: Record<string, string> = {
  awaiting_onboarding: "text-amber-800 bg-amber-100",
  not_started: "text-slate-600 bg-slate-100",
  draft: "text-slate-600 bg-slate-100",
  pending_review: "text-amber-700 bg-amber-100",
  active: "text-emerald-700 bg-emerald-100",
};

const CONDITION_TYPE_LABEL = new Map(CONDITION_SPECIALTIES.map((c) => [c.key, c.label]));

export default function AdminPeopleDirectory({
  people,
  basePath,
  /** What these people are, for the pager's count line and its remembered
   *  page size -- this component renders the patients, therapists and
   *  partners directories, and each keeps its own. */
  noun = "person",
  nounPlural = "people",
  storageKey,
}: {
  people: Person[];
  basePath: string;
  noun?: string;
  nounPlural?: string;
  storageKey?: string;
}) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [careFilter, setCareFilter] = useState("all");
  const [conditionTypeFilter, setConditionTypeFilter] = useState("all");
  const [specialtyFilter, setSpecialtyFilter] = useState<string>(SPECIALTY_FILTER_ALL);

  const hasCareStatus = people.some((p) => p.careStatus !== undefined);
  const hasSpecialty = people.some((p) => p.specialization !== undefined);
  // Built from the people on screen rather than from the eight the clinic
  // recognises: an option matching nobody is a dead end, and the count is
  // what says whether it is worth opening. Same rule the rest of this
  // dashboard's filters follow.
  const specialtyOptions = hasSpecialty
    ? specialtyFilterOptions(people.map((p) => p.specialization))
    : [];

  const normalizedQuery = query.trim().toLowerCase();
  const hasRefs = people.some((p) => p.searchRefs && p.searchRefs.length > 0);
  // Which hidden reference put each person in the results, when it was one.
  // Only looked up when the visible fields did not match, so typing a name
  // never shows a payment chip.
  const refMatchById = new Map<string, SearchRef>();
  const filtered = people
    .filter((p) => {
      if (!normalizedQuery) return true;
      const visibleMatch = [p.full_name, p.subtitle, p.code, specialtyLabel(p.specialization)]
        .filter((v): v is string => !!v)
        .some((v) => v.toLowerCase().includes(normalizedQuery));
      if (visibleMatch) return true;
      const ref = matchSearchRef(p.searchRefs, query);
      if (ref) refMatchById.set(p.id, ref);
      return ref !== null;
    })
    .filter((p) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "pending") return p.approved === false;
      if (statusFilter === "suspended") return !p.active;
      return p.active && p.approved !== false;
    })
    .filter((p) => careFilter === "all" || (p.careStatus ?? "not_started") === careFilter)
    .filter((p) => conditionTypeFilter === "all" || p.conditionType === conditionTypeFilter)
    .filter((p) => !hasSpecialty || matchesSpecialtyFilter(p.specialization, specialtyFilter));

  // Both views page off the same filtered list, so switching grid/list
  // keeps you looking at the same people rather than jumping.
  const { rows: pageRows, pager } = usePagedList(filtered, {
    storageKey: storageKey ?? `admin-directory-${basePath}`,
  });

  function refChip(p: Person) {
    const ref = refMatchById.get(p.id);
    if (!ref) return null;
    return (
      <span
        className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] text-teal-800 ring-1 ring-inset ring-teal-200"
        title={`Matched ${SEARCH_REF_LABEL[ref.kind].toLowerCase()} ${ref.value}`}
      >
        <i aria-hidden="true" className={`fa-solid ${ref.kind === "payment" || ref.kind === "order" ? "fa-receipt" : "fa-hashtag"} text-[9px]`}></i>
        <span className="font-semibold">{SEARCH_REF_LABEL[ref.kind]}</span>
        <span className="truncate font-mono">{ref.value}</span>
      </span>
    );
  }

  function badge(p: Person) {
    if (!p.active) {
      return (
        <span className="text-[9px] font-bold uppercase text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full">
          Suspended
        </span>
      );
    }
    if (p.approved === false) {
      return (
        <span className="text-[9px] font-bold uppercase text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
          Pending
        </span>
      );
    }
    return null;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
          <input
            aria-label={
              hasRefs
                ? "Search people by name, email, ID, session code or payment ID"
                : "Search people by name, email or ID"
            }
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={hasRefs ? "Name, email, ID, SS0004 or pay_..." : "Search by name, email, or ID..."}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs"
          />
        </div>
        <select
          aria-label="Filter by account status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
        >
          <option value="all">Any status</option>
          <option value="active">Active</option>
          <option value="pending">Waiting for approval</option>
          <option value="suspended">Suspended</option>
        </select>
        {hasSpecialty && (
          <select
            aria-label="Filter by specialisation"
            value={specialtyFilter}
            onChange={(e) => setSpecialtyFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          >
            {specialtyOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} ({o.count})
              </option>
            ))}
          </select>
        )}
        {hasCareStatus && (
          <>
            <select
              aria-label="Filter by Health Profile status"
              value={careFilter}
              onChange={(e) => setCareFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            >
              <option value="all">Any Health Profile</option>
              <option value="pending_review">Waiting on review</option>
              <option value="awaiting_onboarding">Awaiting first record</option>
              <option value="draft">Draft</option>
              <option value="active">Complete</option>
            </select>
            <select
              aria-label="Filter by condition type"
              value={conditionTypeFilter}
              onChange={(e) => setConditionTypeFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            >
              <option value="all">All condition types</option>
              {CONDITION_SPECIALTIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </>
        )}
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-[11px] font-semibold">
          <button
            onClick={() => setView("grid")}
            className={`px-3 py-1.5 transition flex items-center gap-1.5 ${
              view === "grid" ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <i className="fa-solid fa-grip"></i> Grid
          </button>
          <button
            onClick={() => setView("list")}
            className={`px-3 py-1.5 transition flex items-center gap-1.5 border-l border-slate-200 ${
              view === "list" ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <i className="fa-solid fa-list"></i> List
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-slate-500 py-4 text-center">
          {query ? `No matches for "${query}".` : "Nobody matches these filters."}
        </p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {pageRows.map((p) => (
            <Link
              key={p.id}
              href={`${basePath}/${p.id}`}
              className="flex flex-col items-center text-center p-4 rounded-xl border border-slate-200 hover:border-teal-300 hover:shadow-sm transition relative"
            >
              {badge(p) && <span className="absolute top-2 right-2">{badge(p)}</span>}
              <AvatarThumbnail url={p.avatar_url} name={p.full_name ?? "U"} size={56} />
              <p className="font-bold text-slate-900 text-xs mt-2 line-clamp-1">{p.full_name}</p>
              {p.code && <p className="text-slate-500 text-[10px] font-mono">{p.code}</p>}
              <p className="text-slate-500 text-[11px] line-clamp-1">{p.subtitle}</p>
              {refChip(p)}
              {p.specialization && (
                <span className="mt-1">
                  <SpecialtyChip specialization={p.specialization} size="xs" />
                </span>
              )}
              {p.careStatus && (
                <span
                  className={`mt-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                    CARE_STATUS_STYLES[p.careStatus] ?? "text-slate-600 bg-slate-100"
                  }`}
                >
                  {p.conditionType ? `${CONDITION_TYPE_LABEL.get(p.conditionType) ?? ""} · ` : ""}
                  {CARE_STATUS_LABELS[p.careStatus] ?? p.careStatus}
                </span>
              )}
              <p className="text-slate-500 text-[10px] mt-1">Joined {formatClinicDateTimeWithZone(p.created_at)}</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-3 font-semibold">ID</th>
                <th className="py-2 pr-3 font-semibold">Name</th>
                <th className="py-2 pr-3 font-semibold">Details</th>
                {hasSpecialty && <th className="py-2 pr-3 font-semibold">Specialist in</th>}
                {hasCareStatus && <th className="py-2 pr-3 font-semibold">Health Profile</th>}
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 pr-3 font-semibold">Joined (IST)</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                  <td className="py-2 pr-3 text-slate-500 font-mono">{p.code ?? "-"}</td>
                  <td className="py-2 pr-3">
                    <Link
                      href={`${basePath}/${p.id}`}
                      className="flex items-center gap-2.5 font-bold text-slate-900 hover:text-teal-700 hover:underline transition"
                    >
                      <AvatarThumbnail url={p.avatar_url} name={p.full_name ?? "U"} size={28} />
                      {p.full_name}
                    </Link>
                    {refChip(p)}
                  </td>
                  <td className="py-2 pr-3 text-slate-500">{p.subtitle}</td>
                  {hasSpecialty && (
                    <td className="py-2 pr-3 text-slate-500">
                      {specialtyLabel(p.specialization) ?? "-"}
                    </td>
                  )}
                  {hasCareStatus && (
                    <td className="py-2 pr-3">
                      <Link
                        href={`/admin/dashboard/conditions/${p.id}`}
                        className="inline-flex flex-wrap items-center gap-1.5 hover:underline"
                      >
                        {p.conditionType && (
                          <span className="text-slate-600">{CONDITION_TYPE_LABEL.get(p.conditionType)}</span>
                        )}
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                            CARE_STATUS_STYLES[p.careStatus ?? "not_started"] ?? "text-slate-600 bg-slate-100"
                          }`}
                        >
                          {CARE_STATUS_LABELS[p.careStatus ?? "not_started"] ?? p.careStatus}
                        </span>
                      </Link>
                    </td>
                  )}
                  <td className="py-2 pr-3">{badge(p) ?? <span className="text-slate-500">Active</span>}</td>
                  <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">{formatClinicDateTimeWithZone(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ListPager pager={pager} noun={noun} nounPlural={nounPlural} />
    </div>
  );
}
