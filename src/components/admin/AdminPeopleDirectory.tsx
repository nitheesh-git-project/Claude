"use client";

import { useState } from "react";
import Link from "next/link";
import AvatarThumbnail from "@/components/profile/AvatarThumbnail";
import { formatIST } from "@/lib/formatIST";

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
  // Where this patient's care intake has got to, when the caller has it
  // (therapists have no intake, so they pass nothing). Folded in here rather
  // than living on its own screen: intake status is a fact about a patient,
  // and a separate tab meant holding a patient's identity in your head while
  // switching screens to look it up.
  careStatus?: string | null;
};

const CARE_STATUS_LABELS: Record<string, string> = {
  not_started: "No intake yet",
  pending: "Waiting on review",
  approved: "Intake live",
  rejected: "Intake rejected",
};

const CARE_STATUS_STYLES: Record<string, string> = {
  not_started: "text-slate-500 bg-slate-100",
  pending: "text-amber-700 bg-amber-100",
  approved: "text-teal-700 bg-teal-50",
  rejected: "text-red-700 bg-red-100",
};

export default function AdminPeopleDirectory({
  people,
  basePath,
}: {
  people: Person[];
  basePath: string;
}) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [careFilter, setCareFilter] = useState("all");

  const hasCareStatus = people.some((p) => p.careStatus !== undefined);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = people
    .filter((p) =>
      normalizedQuery
        ? [p.full_name, p.subtitle, p.code]
            .filter((v): v is string => !!v)
            .some((v) => v.toLowerCase().includes(normalizedQuery))
        : true
    )
    .filter((p) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "pending") return p.approved === false;
      if (statusFilter === "suspended") return !p.active;
      return p.active && p.approved !== false;
    })
    .filter((p) => careFilter === "all" || (p.careStatus ?? "not_started") === careFilter);

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
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, or ID..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
        >
          <option value="all">Any status</option>
          <option value="active">Active</option>
          <option value="pending">Waiting for approval</option>
          <option value="suspended">Suspended</option>
        </select>
        {hasCareStatus && (
          <select
            value={careFilter}
            onChange={(e) => setCareFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          >
            <option value="all">Any care intake</option>
            <option value="pending">Intake waiting on review</option>
            <option value="approved">Intake live</option>
            <option value="not_started">No intake yet</option>
            <option value="rejected">Intake rejected</option>
          </select>
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
          {filtered.map((p) => (
            <Link
              key={p.id}
              href={`${basePath}/${p.id}`}
              className="flex flex-col items-center text-center p-4 rounded-xl border border-slate-200 hover:border-teal-300 hover:shadow-sm transition relative"
            >
              {badge(p) && <span className="absolute top-2 right-2">{badge(p)}</span>}
              <AvatarThumbnail url={p.avatar_url} name={p.full_name ?? "U"} size={56} />
              <p className="font-bold text-slate-900 text-xs mt-2 line-clamp-1">{p.full_name}</p>
              {p.code && <p className="text-slate-400 text-[10px] font-mono">{p.code}</p>}
              <p className="text-slate-500 text-[11px] line-clamp-1">{p.subtitle}</p>
              {p.careStatus && (
                <span
                  className={`mt-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                    CARE_STATUS_STYLES[p.careStatus] ?? "text-slate-500 bg-slate-100"
                  }`}
                >
                  {CARE_STATUS_LABELS[p.careStatus] ?? p.careStatus}
                </span>
              )}
              <p className="text-slate-400 text-[10px] mt-1">Joined {formatIST(p.created_at)}</p>
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
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 pr-3 font-semibold">Joined (IST)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                  <td className="py-2 pr-3 text-slate-400 font-mono">{p.code ?? "—"}</td>
                  <td className="py-2 pr-3">
                    <Link
                      href={`${basePath}/${p.id}`}
                      className="flex items-center gap-2.5 font-bold text-slate-900 hover:text-teal-700 hover:underline transition"
                    >
                      <AvatarThumbnail url={p.avatar_url} name={p.full_name ?? "U"} size={28} />
                      {p.full_name}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-slate-500">{p.subtitle}</td>
                  <td className="py-2 pr-3">{badge(p) ?? <span className="text-slate-400">Active</span>}</td>
                  <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">{formatIST(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
