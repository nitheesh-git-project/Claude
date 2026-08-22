"use client";

import { useMemo, useState } from "react";
import type { CsvColumn } from "@/lib/csvExport";
import DataExportButtons from "@/components/admin/DataExportButtons";
import HomeVisitPurchaseDetailModal from "@/components/admin/HomeVisitPurchaseDetailModal";
import { daysUntilHomeVisitExpiry } from "@/lib/homeVisitProgress";

export type HomeVisitPurchaseRow = {
  id: string;
  purchaseCode: string | null;
  patientId: string;
  patientName: string;
  patientCode: string | null;
  packageId: string;
  packageTitle: string;
  therapistId: string | null;
  therapistName: string | null;
  visitCount: number;
  visitsUsed: number;
  completedCount: number;
  scheduledCount: number;
  pendingCount: number;
  amountPaidPaise: number | null;
  paymentMode: string;
  paymentStatus: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
};

const STATUS_OPTIONS = ["active", "completed", "expired", "refunded", "cancelled"] as const;
const EXPIRING_WINDOW_DAYS = 30;

// The home-visit twin of PackagePurchasesTable.
export default function HomeVisitPurchasesTable({
  purchases,
  packages,
  therapists,
}: {
  purchases: HomeVisitPurchaseRow[];
  packages: { id: string; title: string }[];
  therapists: { id: string; full_name: string }[];
}) {
  const [search, setSearch] = useState("");
  const [packageId, setPackageId] = useState("");
  const [status, setStatus] = useState("");
  const [therapistId, setTherapistId] = useState("");
  const [expiringSoonOnly, setExpiringSoonOnly] = useState(false);
  const [unscheduledOnly, setUnscheduledOnly] = useState(false);
  const [openPurchaseId, setOpenPurchaseId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return purchases.filter((p) => {
      if (packageId && p.packageId !== packageId) return false;
      if (status && p.status !== status) return false;
      if (therapistId && p.therapistId !== therapistId) return false;
      if (unscheduledOnly && p.pendingCount <= 0) return false;
      if (expiringSoonOnly) {
        const days = daysUntilHomeVisitExpiry(p.expiresAt, now);
        if (days === null || days > EXPIRING_WINDOW_DAYS || p.status !== "active") return false;
      }
      if (term) {
        const haystack = `${p.patientName} ${p.patientCode ?? ""} ${p.purchaseCode ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [purchases, packageId, status, therapistId, expiringSoonOnly, unscheduledOnly, search, now]);

  const exportColumns = useMemo<CsvColumn<(typeof filtered)[number]>[]>(
    () =>
      [
        { header: "Purchase Code", value: (p) => p.purchaseCode ?? "" },
        { header: "Patient", value: (p) => p.patientName },
        { header: "Patient Code", value: (p) => p.patientCode ?? "" },
        { header: "Package", value: (p) => p.packageTitle },
        { header: "Therapist", value: (p) => p.therapistName ?? "" },
        { header: "Completed", value: (p) => p.completedCount },
        { header: "Scheduled", value: (p) => p.scheduledCount },
        { header: "Pending", value: (p) => p.pendingCount },
        { header: "Total Visits", value: (p) => p.visitCount },
        { header: "Amount Paid (INR)", value: (p) => ((p.amountPaidPaise ?? 0) / 100).toFixed(2) },
        { header: "Payment Mode", value: (p) => p.paymentMode },
        { header: "Payment Status", value: (p) => p.paymentStatus },
        { header: "Status", value: (p) => p.status },
        { header: "Purchased", value: (p) => new Date(p.createdAt).toLocaleDateString() },
        { header: "Expires", value: (p) => (p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : "") },
      ],
    []
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Patient name, patient code, or purchase code"
            className="w-full text-xs p-2 rounded-lg border border-slate-300"
          />
        </div>
        <FilterSelect label="Package" value={packageId} onChange={setPackageId} options={packages.map((p) => ({ value: p.id, label: p.title }))} />
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))}
        />
        <FilterSelect label="Therapist" value={therapistId} onChange={setTherapistId} options={therapists.map((t) => ({ value: t.id, label: t.full_name }))} />
        <label className="flex items-center gap-1.5 text-xs text-slate-600 pb-2">
          <input type="checkbox" checked={expiringSoonOnly} onChange={(e) => setExpiringSoonOnly(e.target.checked)} className="accent-teal-600" />
          Expiring soon
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 pb-2">
          <input type="checkbox" checked={unscheduledOnly} onChange={(e) => setUnscheduledOnly(e.target.checked)} className="accent-teal-600" />
          Has unscheduled visits
        </label>
        <DataExportButtons
          filename="home-visit-package-purchases"
          title="Home visit package purchases"
          subtitle="Every home-visit package purchase, with the filters in view applied."
          rows={filtered}
          columns={exportColumns}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-200">
              <th className="py-2 pr-3">Purchase</th>
              <th className="py-2 pr-3">Patient</th>
              <th className="py-2 pr-3">Package</th>
              <th className="py-2 pr-3">Therapist</th>
              <th className="py-2 pr-3">Progress</th>
              <th className="py-2 pr-3">Payment</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Expires</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-slate-400">
                  No home visit purchases match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setOpenPurchaseId(p.id)}
                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                >
                  <td className="py-2 pr-3 font-mono text-slate-500">{p.purchaseCode ?? "—"}</td>
                  <td className="py-2 pr-3">
                    <p className="font-semibold text-slate-800">{p.patientName}</p>
                    <p className="text-slate-400 font-mono">{p.patientCode ?? ""}</p>
                  </td>
                  <td className="py-2 pr-3">{p.packageTitle}</td>
                  <td className="py-2 pr-3">{p.therapistName ?? <span className="text-slate-400">Not locked</span>}</td>
                  <td className="py-2 pr-3">
                    <span className="font-semibold text-slate-800">
                      {p.completedCount + p.scheduledCount} / {p.visitCount}
                    </span>
                    <span className="text-slate-400"> ({p.pendingCount} pending)</span>
                  </td>
                  <td className="py-2 pr-3">{p.paymentMode === "cash_on_visit" ? "Cash" : "Prepaid"}</td>
                  <td className="py-2 pr-3 capitalize">{p.status}</td>
                  <td className="py-2 pr-3">{p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {openPurchaseId && (
        <HomeVisitPurchaseDetailModal
          key={openPurchaseId}
          purchaseId={openPurchaseId}
          therapists={therapists}
          onClose={() => setOpenPurchaseId(null)}
        />
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs p-2 rounded-lg border border-slate-300 bg-white"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
