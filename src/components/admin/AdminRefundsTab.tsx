"use client";

import { useMemo, useState } from "react";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";
import ListPager from "@/components/dashboard/ListPager";
import FilterChips from "@/components/dashboard/FilterChips";
import CopyText from "@/components/system/CopyText";
import { usePagedList } from "@/lib/usePagedList";
import { formatClinicDateTime } from "@/lib/formatDateTime";
import { formatInr } from "@/lib/formatMoney";
import { adminScreenHref } from "@/lib/adminNav";
import { REFUND_STATUS_LABEL, type RefundStatus } from "@/lib/razorpayRefundSync";

/**
 * Money -> Refunds: every refund Razorpay has reported -- started here or on
 * the Razorpay website -- with where it is (started, on its way, refunded,
 * failed), who it was for, and what the app did about it. The ones that
 * need a person (a website refund against a programme, a payment the app
 * has no booking for, a refund the bank failed) are counted at the top and
 * can be marked dealt with. Rules: src/lib/razorpayRefundSync.ts.
 */
export type RefundListRow = {
  refundId: string;
  paymentId: string;
  amountPaise: number;
  status: string;
  source: string;
  patientId: string | null;
  patientName: string | null;
  sessionCode: string | null;
  against: "session" | "programme" | "home visits" | null;
  applied: string;
  note: string | null;
  at: string;
  reviewedAt: string | null;
};

const STATUS_CLASS: Record<string, string> = {
  processed: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
  pending: "bg-amber-100 text-amber-800",
  created: "bg-slate-100 text-slate-700",
};

function needsPerson(r: RefundListRow): boolean {
  if (r.reviewedAt) return false;
  return r.applied === "needs_review" || (r.status === "failed" && r.source === "app");
}

type Filter = "all" | "attention" | "on_razorpay" | "failed";

export default function AdminRefundsTab({ rows, canManage }: { rows: RefundListRow[]; canManage: boolean }) {
  const router = useRouter();
  const { show } = useToast();
  const [filter, setFilter] = useState<Filter>(() => (rows.some(needsPerson) ? "attention" : "all"));
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "attention" && !needsPerson(r)) return false;
      if (filter === "on_razorpay" && r.source !== "razorpay") return false;
      if (filter === "failed" && r.status !== "failed") return false;
      if (!q) return true;
      return [r.refundId, r.paymentId, r.patientName ?? "", r.sessionCode ?? ""].some((v) => v.toLowerCase().includes(q));
    });
  }, [rows, filter, query]);
  const { rows: pageRows, pager } = usePagedList(filtered, { storageKey: "admin-refunds", resetKey: `${filter}|${query}` });

  async function review(refundId: string) {
    setBusy(refundId);
    try {
      const res = await fetch("/api/admin/refunds/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refundId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        show(data.error ?? "That didn't save. Please try again.", "error");
        return;
      }
      show("Marked as dealt with.", "success");
      router.refresh();
    } catch {
      show("We couldn't reach the server. Please try again.", "error");
    } finally {
      setBusy(null);
    }
  }

  const attention = rows.filter(needsPerson).length;

  return (
    <div className="space-y-4" data-testid="refunds-tab">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="font-display text-lg font-bold text-slate-800">Refunds</h2>
        <p className="mt-1 text-sm text-slate-600">
          Every refund Razorpay has reported, including ones made on the Razorpay website. A refund on a single
          session is recorded on it by itself; a refund on a programme, or one the bank failed, waits here for you.
        </p>
        {attention > 0 && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm font-semibold text-amber-900">
            {attention} {attention === 1 ? "refund needs" : "refunds need"} a look.
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <FilterChips
            label="Show refunds"
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            choices={[
              { key: "attention", label: "Need a look", count: attention },
              { key: "all", label: "All", count: rows.length },
              { key: "on_razorpay", label: "Made on Razorpay", count: rows.filter((r) => r.source === "razorpay").length },
              { key: "failed", label: "Failed", count: rows.filter((r) => r.status === "failed").length },
            ]}
          />
          <input
            type="search"
            aria-label="Search refunds"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Refund ID, payment ID, patient or session"
            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm sm:w-80"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          {rows.length === 0
            ? "No refunds yet. They appear here as Razorpay reports them."
            : filter === "attention"
              ? "Nothing needs a look."
              : "No refunds match."}
        </div>
      ) : (
        <ul className="space-y-2.5">
          {pageRows.map((r) => (
            <li key={r.refundId} data-testid="refund-row" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="font-semibold text-slate-900">
                    {formatInr(r.amountPaise)}{" "}
                    <span className="font-normal text-slate-600">to</span>{" "}
                    {r.patientId ? (
                      <a href={`/admin/dashboard/patients/${r.patientId}`} className="text-teal-700 hover:underline">
                        {r.patientName}
                      </a>
                    ) : (
                      "an unknown payer"
                    )}
                    {r.against && <span className="font-normal text-slate-600"> for a {r.against}</span>}
                    {r.sessionCode && (
                      <a
                        href={adminScreenHref("sessions", "all", `session:${r.sessionCode}`)}
                        className="ml-1.5 font-mono text-xs text-teal-700 hover:underline"
                      >
                        {r.sessionCode}
                      </a>
                    )}
                  </p>
                  <div className="mt-1.5 space-y-0.5 text-xs text-slate-600">
                    <p>
                      Refund <CopyText value={r.refundId} label="Copy refund ID" />
                    </p>
                    <p>
                      Payment <CopyText value={r.paymentId} label="Copy payment ID" />
                    </p>
                  </div>
                  {r.note && <p className="mt-1.5 text-sm text-slate-700">{r.note}</p>}
                </div>
                <div className="shrink-0 text-sm text-slate-600 sm:text-right">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_CLASS[r.status] ?? STATUS_CLASS.created}`}>
                    {REFUND_STATUS_LABEL[r.status as RefundStatus] ?? r.status}
                  </span>
                  <p className="mt-1">{r.source === "razorpay" ? "Made on Razorpay" : "Started in this dashboard"}</p>
                  <p>{formatClinicDateTime(r.at)}</p>
                  {r.reviewedAt && <p className="text-xs">Dealt with {formatClinicDateTime(r.reviewedAt)}</p>}
                </div>
              </div>
              {needsPerson(r) && canManage && (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void review(r.refundId)}
                    disabled={busy === r.refundId}
                    className="min-h-10 rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {busy === r.refundId ? "Saving…" : "Mark as dealt with"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {filtered.length > 0 && <ListPager pager={pager} noun="refund" nounPlural="refunds" />}
    </div>
  );
}
