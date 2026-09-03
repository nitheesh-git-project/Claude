"use client";

import ListPager from "@/components/dashboard/ListPager";
import { usePagedList } from "@/lib/usePagedList";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import RequestPayoutButton from "@/components/RequestPayoutButton";
import TherapistEarningsChart, { type EarningsDay } from "@/components/TherapistEarningsChart";
import type { TherapistEarningRow } from "@/lib/therapistEarnings";
import { istDateKey } from "@/lib/formatSlotRange";

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
}

type CompletedRequest = {
  id: string;
  requestedAmountPaise: number;
  requestedAt: string;
};

function NotificationBanner({ request }: { request: CompletedRequest }) {
  const [dismissed, setDismissed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (dismissed) return null;

  function handleDismiss() {
    startTransition(async () => {
      // Optimistic -- this is just clearing a notification, not a
      // money-moving action, so there's nothing worth blocking the UI on if
      // the request fails; a refresh will just show it again next time.
      setDismissed(true);
      await fetch("/api/therapist/acknowledge-payout-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: request.id }),
      }).catch(() => {});
      router.refresh();
    });
  }

  return (
    <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 mb-6 flex items-center justify-between gap-3 flex-wrap">
      <p className="text-xs text-teal-900">
        💰 Payment initiated — your payout request for{" "}
        <strong>{formatInr(request.requestedAmountPaise)}</strong> (requested on{" "}
        {formatDate(request.requestedAt)}) is being processed by admin.
      </p>
      <button
        onClick={handleDismiss}
        disabled={isPending}
        className="text-xs font-semibold text-teal-700 hover:underline disabled:opacity-60"
      >
        Dismiss
      </button>
    </div>
  );
}

export default function TherapistEarningsTab({
  rows,
  pendingOwedPaise,
  requestStatus,
  latestCompletedRequest,
}: {
  rows: TherapistEarningRow[];
  pendingOwedPaise: number;
  requestStatus: "none" | "pending" | "reviewing";
  latestCompletedRequest: CompletedRequest | null;
}) {
  const [sessionCodeFilter, setSessionCodeFilter] = useState("");
  const [patientFilter, setPatientFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid_out" | "pending">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const patients = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.patientId, r.patientName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) if (r.categoryId) map.set(r.categoryId, r.categoryTitle);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const fromMs = fromDate ? new Date(fromDate + "T00:00:00+05:30").getTime() : null;
  const toMs = toDate ? new Date(toDate + "T00:00:00+05:30").getTime() + 86_400_000 : null;
  const trimmedSessionCodeFilter = sessionCodeFilter.trim().toLowerCase();

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (
        trimmedSessionCodeFilter &&
        !(r.sessionCode ?? "").toLowerCase().includes(trimmedSessionCodeFilter)
      )
        return false;
      if (patientFilter !== "all" && r.patientId !== patientFilter) return false;
      if (categoryFilter !== "all" && r.categoryId !== categoryFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      const ms = new Date(r.date).getTime();
      if (fromMs !== null && ms < fromMs) return false;
      if (toMs !== null && ms >= toMs) return false;
      return true;
    });
  }, [rows, trimmedSessionCodeFilter, patientFilter, categoryFilter, statusFilter, fromMs, toMs]);

  // Totals and the chart stay over every filtered session -- what is paged
  // is the table underneath them.
  const { rows: pageRows, pager } = usePagedList(filteredRows, {
    storageKey: "therapist-earnings",
  });

  const chartDays: EarningsDay[] = useMemo(() => {
    const byDay = new Map<string, { paidPaise: number; pendingPaise: number }>();
    for (const r of filteredRows) {
      const key = istDateKey(r.date);
      const entry = byDay.get(key) ?? { paidPaise: 0, pendingPaise: 0 };
      if (r.status === "paid_out") entry.paidPaise += r.earningPaise;
      else entry.pendingPaise += r.earningPaise;
      byDay.set(key, entry);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, totals]) => ({
        key,
        label: dayLabel(`${key}T00:00:00+05:30`),
        ...totals,
      }));
  }, [filteredRows]);

  const hasActiveFilters =
    !!sessionCodeFilter ||
    patientFilter !== "all" ||
    categoryFilter !== "all" ||
    statusFilter !== "all" ||
    !!fromDate ||
    !!toDate;

  function clearFilters() {
    setSessionCodeFilter("");
    setPatientFilter("all");
    setCategoryFilter("all");
    setStatusFilter("all");
    setFromDate("");
    setToDate("");
  }

  return (
    <div>
      {latestCompletedRequest && <NotificationBanner request={latestCompletedRequest} />}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs text-slate-500">Pending Payout</p>
          <p className="text-2xl font-bold text-slate-900">{formatInr(pendingOwedPaise)}</p>
          <p className="text-[11px] text-slate-400 mt-1">
            What you&apos;ve earned from completed sessions that haven&apos;t been settled yet.
          </p>
          {requestStatus === "reviewing" && (
            <p className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-2 inline-block">
              Admin is reviewing your payout request.
            </p>
          )}
        </div>
        <RequestPayoutButton owedPaise={pendingOwedPaise} requestStatus={requestStatus} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-4">Earnings Over Time</h2>
        <TherapistEarningsChart days={chartDays} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="font-display font-bold text-lg text-slate-800">
            Sessions
            <span className="ml-2 text-xs font-normal text-slate-400">
              {filteredRows.length} session{filteredRows.length === 1 ? "" : "s"}
            </span>
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={sessionCodeFilter}
              onChange={(e) => setSessionCodeFilter(e.target.value)}
              placeholder="Filter by Session ID"
              className="p-2 rounded-lg border border-slate-300 text-xs font-mono w-40"
            />
            <select
              value={patientFilter}
              onChange={(e) => setPatientFilter(e.target.value)}
              className="p-2 rounded-lg border border-slate-300 text-xs"
            >
              <option value="all">All Patients</option>
              {patients.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="p-2 rounded-lg border border-slate-300 text-xs"
            >
              <option value="all">All Categories</option>
              {categories.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="p-2 rounded-lg border border-slate-300 text-xs"
            >
              <option value="all">All Statuses</option>
              <option value="paid_out">Paid Out</option>
              <option value="pending">Pending</option>
            </select>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="p-2 rounded-lg border border-slate-300 text-xs"
              aria-label="From date"
            />
            <span className="text-slate-400 text-xs">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="p-2 rounded-lg border border-slate-300 text-xs"
              aria-label="To date"
            />
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-teal-700 font-semibold hover:underline"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-200">
                <th className="pb-2 pr-3 font-semibold">Date</th>
                <th className="pb-2 pr-3 font-semibold">Session ID</th>
                <th className="pb-2 pr-3 font-semibold">Patient</th>
                <th className="pb-2 pr-3 font-semibold">Category</th>
                <th className="pb-2 pr-3 font-semibold text-right">Fee</th>
                <th className="pb-2 pr-3 font-semibold text-right">Your Earning</th>
                <th className="pb-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400">
                    No sessions match these filters.
                  </td>
                </tr>
              ) : (
                pageRows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-2.5 pr-3 text-slate-700 whitespace-nowrap">{formatDate(r.date)}</td>
                    <td className="py-2.5 pr-3 text-slate-400 font-mono">{r.sessionCode ?? "—"}</td>
                    <td className="py-2.5 pr-3 font-bold text-slate-900">{r.patientName}</td>
                    <td className="py-2.5 pr-3 text-slate-500">{r.categoryTitle}</td>
                    <td className="py-2.5 pr-3 text-right text-slate-700">{formatInr(r.feePaise)}</td>
                    <td className="py-2.5 pr-3 text-right font-semibold text-teal-700">
                      {formatInr(r.earningPaise)}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`font-semibold px-2.5 py-1 rounded-full ${
                          r.status === "paid_out"
                            ? "text-green-700 bg-green-50"
                            : "text-slate-500 bg-slate-100"
                        }`}
                      >
                        {r.status === "paid_out" ? "Paid Out" : "Pending"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <ListPager pager={pager} noun="session" />
        </div>
      </div>
    </div>
  );
}
