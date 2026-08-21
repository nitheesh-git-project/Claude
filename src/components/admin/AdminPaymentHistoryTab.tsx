"use client";

import { useMemo, useState } from "react";
import { EmptyState } from "@/components/dashboard/SurfaceCard";
import Modal from "@/components/admin/Modal";
import {
  buildPatientTransactions,
  computePatientPaymentSummary,
  buildTherapistPayoutTransactions,
  computeTherapistPayoutHistorySummary,
  type PaymentAppointment,
  type PackagePurchase,
  type PatientTransaction,
  type TherapistPayoutTransaction,
} from "@/lib/paymentHistory";
import {
  buildPatientReceipts,
  buildTherapistPayoutReceipts,
  type PatientReceipt,
  type PayoutReceipt,
  type BookingReceiptStage,
  type PaymentFailureRow,
  type PayoutBatchRow,
} from "@/lib/receipts";
import { formatSlotTime } from "@/lib/formatSlotTime";
import { toCsv } from "@/lib/csvExport";
import DownloadCsvButton from "@/components/admin/DownloadCsvButton";

type Patient = { id: string; full_name: string | null; code?: string | null };
type Therapist = { id: string; full_name: string | null; code?: string | null };
type Category = { id: string; title: string };

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

// Pinned to Asia/Kolkata -- this tab's summary tables (unlike its Modals,
// which only ever mount after a client click) are part of the initial
// render, going through a real SSR pass and then hydration. An unpinned
// zone renders using the Node server's TZ first and the admin's browser TZ
// second, which mismatch on any host that doesn't run in IST -- the same
// hydration-mismatch class of bug already fixed elsewhere in this codebase
// (AdminMetricsTab, AdminRosterTab, AdminCalendarTab).
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}

const RECEIPT_STAGE_LABEL: Record<BookingReceiptStage, string> = {
  payment_confirmed: "Payment Confirmed",
  service_completed: "Service Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  refund_failed: "Refund Failed",
};

const RECEIPT_TYPE_OPTIONS = [
  "Payment Confirmed",
  "Service Completed",
  "Cancelled",
  "Refunded",
  "Refund Failed",
  "Payment Failed",
  "Payout",
] as const;

type AdminReceiptRow = {
  key: string;
  date: string;
  personId: string;
  personRole: "patient" | "therapist";
  personName: string;
  typeLabel: string;
  amountPaise: number | null;
  detail: PatientReceipt | PayoutReceipt;
  // null for payout receipts -- a single settlement batch can cover many
  // sessions, so there's no one session_code that fits (see each session's
  // own code inside the payout detail modal instead).
  sessionCode: string | null;
};

function PatientTransactionTable({ transactions }: { transactions: PatientTransaction[] }) {
  if (transactions.length === 0) {
    return (
      <EmptyState
        icon="fa-receipt"
        title="No payments yet"
        body="Every completed, refunded and failed payment attempt lands here."
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-400 border-b border-slate-200">
            <th className="pb-2 pr-3 font-semibold">Date</th>
            <th className="pb-2 pr-3 font-semibold">Session ID</th>
            <th className="pb-2 pr-3 font-semibold">Transaction ID</th>
            <th className="pb-2 pr-3 font-semibold">Mode of Payment</th>
            <th className="pb-2 pr-3 font-semibold text-right">Amount</th>
            <th className="pb-2 pr-3 font-semibold">Session / Purpose</th>
            <th className="pb-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id} className="border-b border-slate-100">
              <td className="py-2.5 pr-3 text-slate-700 whitespace-nowrap">{formatDateTime(t.date)}</td>
              <td className="py-2.5 pr-3 text-slate-400 font-mono">{t.sessionCode ?? "—"}</td>
              <td className="py-2.5 pr-3 text-slate-500 font-mono">{t.transactionId ?? "—"}</td>
              <td className="py-2.5 pr-3 text-slate-700">{t.modeOfPayment}</td>
              <td className="py-2.5 pr-3 text-right font-semibold text-slate-900">{formatInr(t.amountPaise)}</td>
              <td className="py-2.5 pr-3 text-slate-700">{t.purpose}</td>
              <td className="py-2.5">
                <span className="font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                  {t.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TherapistTransactionTable({ transactions }: { transactions: TherapistPayoutTransaction[] }) {
  if (transactions.length === 0) {
    return (
      <EmptyState
        icon="fa-money-bill-transfer"
        title="No payouts settled yet"
        body={"Once you settle a therapist’s earnings, the batch appears here."}
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-400 border-b border-slate-200">
            <th className="pb-2 pr-3 font-semibold">Date</th>
            <th className="pb-2 pr-3 font-semibold">Session ID</th>
            <th className="pb-2 pr-3 font-semibold">Method</th>
            <th className="pb-2 pr-3 font-semibold text-right">Amount</th>
            <th className="pb-2 pr-3 font-semibold">Session / Purpose</th>
            <th className="pb-2 pr-3 font-semibold">Note</th>
            <th className="pb-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id} className="border-b border-slate-100">
              <td className="py-2.5 pr-3 text-slate-700 whitespace-nowrap">{formatDateTime(t.date)}</td>
              <td className="py-2.5 pr-3 text-slate-400 font-mono">{t.sessionCode ?? "—"}</td>
              <td className="py-2.5 pr-3 text-slate-700">{t.method}</td>
              <td className="py-2.5 pr-3 text-right font-semibold text-slate-900">{formatInr(t.amountPaise)}</td>
              <td className="py-2.5 pr-3 text-slate-700">{t.purpose}</td>
              <td className="py-2.5 pr-3 text-slate-500">{t.note ?? "—"}</td>
              <td className="py-2.5">
                <span className="font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                  {t.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminPaymentHistoryTab({
  patients,
  therapists,
  appointments,
  packagePurchases,
  paymentFailures,
  payoutBatches,
  categories,
}: {
  patients: Patient[];
  therapists: Therapist[];
  appointments: PaymentAppointment[];
  packagePurchases: PackagePurchase[];
  paymentFailures: PaymentFailureRow[];
  payoutBatches: PayoutBatchRow[];
  categories: Category[];
}) {
  const [openPatientId, setOpenPatientId] = useState<string | null>(null);
  const [openTherapistId, setOpenTherapistId] = useState<string | null>(null);
  const [receiptPersonFilter, setReceiptPersonFilter] = useState<string>("all");
  const [receiptTypeFilter, setReceiptTypeFilter] = useState<string>("all");
  const [receiptFromDate, setReceiptFromDate] = useState<string>("");
  const [receiptToDate, setReceiptToDate] = useState<string>("");
  const [receiptSessionCodeFilter, setReceiptSessionCodeFilter] = useState<string>("");
  const [openReceipt, setOpenReceipt] = useState<AdminReceiptRow | null>(null);

  const categoryTitleById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.title])),
    [categories]
  );
  const sessionCodeByAppointmentId = useMemo(
    () => new Map(appointments.map((a) => [a.id, a.session_code ?? null])),
    [appointments]
  );
  const patientNameById = useMemo(
    () => new Map(patients.map((p) => [p.id, p.full_name ?? "Unknown"])),
    [patients]
  );

  const patientRows = patients
    .map((p) => {
      const transactions = buildPatientTransactions(
        appointments.filter((a) => a.patient_id === p.id),
        packagePurchases.filter((pp) => pp.patient_id === p.id),
        categoryTitleById
      );
      const summary = computePatientPaymentSummary(p.id, transactions);
      return { patient: p, transactions, summary };
    })
    .sort((a, b) => b.summary.totalSpentPaise - a.summary.totalSpentPaise);

  const therapistRows = therapists
    .map((t) => {
      const transactions = buildTherapistPayoutTransactions(
        appointments.filter((a) => a.therapist_id === t.id),
        patientNameById
      );
      const summary = computeTherapistPayoutHistorySummary(t.id, transactions);
      return { therapist: t, transactions, summary };
    })
    .sort((a, b) => b.summary.totalPaidOutPaise - a.summary.totalPaidOutPaise);

  const openPatient = patientRows.find((r) => r.patient.id === openPatientId);
  const openTherapist = therapistRows.find((r) => r.therapist.id === openTherapistId);

  const totalPatientSpendPaise = patientRows.reduce((sum, r) => sum + r.summary.totalSpentPaise, 0);
  const totalTherapistPaidOutPaise = therapistRows.reduce((sum, r) => sum + r.summary.totalPaidOutPaise, 0);

  const allReceiptRows: AdminReceiptRow[] = useMemo(() => {
    const rows: AdminReceiptRow[] = [];
    for (const p of patients) {
      const receipts = buildPatientReceipts(
        appointments.filter((a) => a.patient_id === p.id),
        packagePurchases.filter((pp) => pp.patient_id === p.id),
        paymentFailures.filter((f) => f.patient_id === p.id),
        categoryTitleById
      );
      for (const r of receipts) {
        rows.push({
          key: `patient-${r.kind}-${r.id}`,
          date: r.date,
          personId: p.id,
          personRole: "patient",
          personName: p.full_name ?? "Unknown",
          typeLabel: r.kind === "booking" ? RECEIPT_STAGE_LABEL[r.stage] : "Payment Failed",
          amountPaise: r.kind === "booking" ? (r.isPackageCovered ? null : r.amountPaise) : r.amountPaise,
          detail: r,
          sessionCode: r.appointmentId ? sessionCodeByAppointmentId.get(r.appointmentId) ?? null : null,
        });
      }
    }
    for (const t of therapists) {
      const receipts = buildTherapistPayoutReceipts(
        payoutBatches.filter((b) => b.therapist_id === t.id),
        appointments.filter((a) => a.therapist_id === t.id),
        patientNameById
      );
      for (const r of receipts) {
        rows.push({
          key: `therapist-payout-${r.id}`,
          date: r.settledAt,
          personId: t.id,
          personRole: "therapist",
          personName: t.full_name ?? "Unknown",
          typeLabel: "Payout",
          amountPaise: r.amountPaise,
          detail: r,
          sessionCode: null,
        });
      }
    }
    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [
    patients,
    therapists,
    appointments,
    packagePurchases,
    paymentFailures,
    payoutBatches,
    categoryTitleById,
    patientNameById,
    sessionCodeByAppointmentId,
  ]);

  // Parsed with an explicit +05:30 offset, same reasoning as
  // AdminMetricsTab's own date-range filter -- a fixed zone (not the
  // runtime's local one) avoids an SSR/hydration mismatch, and IST
  // specifically (not just any fixed zone) matches every other date
  // boundary on this dashboard.
  const receiptFromMs = receiptFromDate
    ? new Date(receiptFromDate + "T00:00:00+05:30").getTime()
    : null;
  const receiptToMs = receiptToDate
    ? new Date(receiptToDate + "T00:00:00+05:30").getTime() + 86_400_000
    : null;

  const trimmedReceiptSessionCodeFilter = receiptSessionCodeFilter.trim().toLowerCase();
  const filteredReceiptRows = allReceiptRows.filter((r) => {
    if (receiptPersonFilter !== "all") {
      const [role, id] = receiptPersonFilter.split(":");
      if (r.personRole !== role || r.personId !== id) return false;
    }
    if (receiptTypeFilter !== "all" && r.typeLabel !== receiptTypeFilter) return false;
    if (
      trimmedReceiptSessionCodeFilter &&
      !(r.sessionCode ?? "").toLowerCase().includes(trimmedReceiptSessionCodeFilter)
    )
      return false;
    const ms = new Date(r.date).getTime();
    if (receiptFromMs !== null && ms < receiptFromMs) return false;
    if (receiptToMs !== null && ms >= receiptToMs) return false;
    return true;
  });

  const today = new Date().toISOString().slice(0, 10);

  // Not wrapped in useMemo -- patientRows/therapistRows above are themselves
  // plain consts recomputed every render (not memoized), so memoizing only
  // this derived step would depend on an already-unstable reference and
  // buys nothing.
  const patientHistoryCsv = toCsv(patientRows, [
    { header: "Patient ID", value: (r) => r.patient.code ?? "" },
    { header: "Patient Name", value: (r) => r.patient.full_name ?? "Unknown" },
    { header: "Total Spent (INR)", value: (r) => r.summary.totalSpentPaise / 100 },
    { header: "Last Payment", value: (r) => r.summary.lastPaymentAt ?? "" },
  ]);

  const therapistHistoryCsv = toCsv(therapistRows, [
    { header: "Therapist ID", value: (r) => r.therapist.code ?? "" },
    { header: "Therapist Name", value: (r) => r.therapist.full_name ?? "Unknown" },
    { header: "Total Paid Out (INR)", value: (r) => r.summary.totalPaidOutPaise / 100 },
    { header: "Last Payout", value: (r) => r.summary.lastPayoutAt ?? "" },
  ]);

  const receiptsCsv = useMemo(
    () =>
      toCsv(filteredReceiptRows, [
        { header: "Date", value: (r) => r.date },
        { header: "Session ID", value: (r) => r.sessionCode ?? "" },
        { header: "Who", value: (r) => r.personName },
        { header: "Role", value: (r) => r.personRole },
        { header: "Type", value: (r) => r.typeLabel },
        { header: "Amount (INR)", value: (r) => (r.amountPaise !== null ? r.amountPaise / 100 : "") },
      ]),
    [filteredReceiptRows]
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h2 className="font-display font-bold text-lg text-slate-800">Money in — from patients</h2>
          <div className="flex items-center gap-3">
            <p className="text-xs text-slate-500">
              Money in, all-time: <strong className="text-teal-700">{formatInr(totalPatientSpendPaise)}</strong>
            </p>
            <DownloadCsvButton
              filename={`patient-payment-history-${today}.csv`}
              csv={patientHistoryCsv}
              disabled={patientRows.length === 0}
            />
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mb-4">
          Every successful session payment and package purchase, per patient. Sessions covered by an
          already-paid package aren&apos;t counted again here — the package purchase itself is the real
          transaction.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-200">
                <th className="pb-2 pr-3 font-semibold">Patient ID</th>
                <th className="pb-2 pr-3 font-semibold">Patient Name</th>
                <th className="pb-2 pr-3 font-semibold text-right">Total Spent</th>
                <th className="pb-2 pr-3 font-semibold">Last Payment</th>
                <th className="pb-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {patientRows.map(({ patient, summary }) => (
                <tr key={patient.id} className="border-b border-slate-100">
                  <td className="py-2.5 pr-3 text-slate-400 font-mono">{patient.code ?? "—"}</td>
                  <td className="py-2.5 pr-3 font-bold text-slate-900">{patient.full_name ?? "Unknown"}</td>
                  <td className="py-2.5 pr-3 text-right text-slate-700">{formatInr(summary.totalSpentPaise)}</td>
                  <td className="py-2.5 pr-3 text-slate-700">
                    {summary.lastPaymentAt ? formatDateTime(summary.lastPaymentAt) : "—"}
                  </td>
                  <td className="py-2.5">
                    <button
                      onClick={() => setOpenPatientId(patient.id)}
                      disabled={summary.transactionCount === 0}
                      className="text-teal-700 font-semibold hover:underline disabled:text-slate-300 disabled:no-underline disabled:cursor-not-allowed"
                    >
                      View History
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {patientRows.length === 0 && (
          <EmptyState icon="fa-user-injured" title="No patients yet" body="Patients appear here as soon as they register or are referred." />
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h2 className="font-display font-bold text-lg text-slate-800">Money out — to therapists</h2>
          <div className="flex items-center gap-3">
            <p className="text-xs text-slate-500">
              Money out, all-time: <strong className="text-teal-700">{formatInr(totalTherapistPaidOutPaise)}</strong>
            </p>
            <DownloadCsvButton
              filename={`therapist-payment-history-${today}.csv`}
              csv={therapistHistoryCsv}
              disabled={therapistRows.length === 0}
            />
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mb-4">
          Every payout settlement an admin has recorded for a therapist. These are admin-recorded
          cash/online record-keeping entries, not payment-gateway charges — see the Payouts tab for
          what&apos;s currently still owed.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-200">
                <th className="pb-2 pr-3 font-semibold">Therapist ID</th>
                <th className="pb-2 pr-3 font-semibold">Therapist Name</th>
                <th className="pb-2 pr-3 font-semibold text-right">Total Paid Out</th>
                <th className="pb-2 pr-3 font-semibold">Last Payout</th>
                <th className="pb-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {therapistRows.map(({ therapist, summary }) => (
                <tr key={therapist.id} className="border-b border-slate-100">
                  <td className="py-2.5 pr-3 text-slate-400 font-mono">{therapist.code ?? "—"}</td>
                  <td className="py-2.5 pr-3 font-bold text-slate-900">{therapist.full_name ?? "Unknown"}</td>
                  <td className="py-2.5 pr-3 text-right text-slate-700">{formatInr(summary.totalPaidOutPaise)}</td>
                  <td className="py-2.5 pr-3 text-slate-700">
                    {summary.lastPayoutAt ? formatDateTime(summary.lastPayoutAt) : "—"}
                  </td>
                  <td className="py-2.5">
                    <button
                      onClick={() => setOpenTherapistId(therapist.id)}
                      disabled={summary.transactionCount === 0}
                      className="text-teal-700 font-semibold hover:underline disabled:text-slate-300 disabled:no-underline disabled:cursor-not-allowed"
                    >
                      View History
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {therapistRows.length === 0 && (
          <EmptyState icon="fa-user-doctor" title="No therapists yet" body="Approved therapists appear here once a payout has been settled for them." />
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h2 className="font-display font-bold text-lg text-slate-800">Receipts</h2>
          <DownloadCsvButton
            filename={`receipts-${today}.csv`}
            csv={receiptsCsv}
            disabled={filteredReceiptRows.length === 0}
          />
        </div>
        <p className="text-[11px] text-slate-400 mb-4">
          Every receipt generated on the platform — patient payments, completed sessions, failed
          payment attempts, and therapist payouts — in one filterable log. The download reflects
          whatever filters are currently applied below.
        </p>

        <div className="flex items-center gap-3 flex-wrap mb-4">
          <select
            value={receiptPersonFilter}
            onChange={(e) => setReceiptPersonFilter(e.target.value)}
            className="p-2 rounded-lg border border-slate-300 text-xs"
          >
            <option value="all">All Patients &amp; Therapists</option>
            <optgroup label="Patients">
              {patients.map((p) => (
                <option key={p.id} value={`patient:${p.id}`}>
                  {p.full_name ?? "Unknown"}
                </option>
              ))}
            </optgroup>
            <optgroup label="Therapists">
              {therapists.map((t) => (
                <option key={t.id} value={`therapist:${t.id}`}>
                  {t.full_name ?? "Unknown"}
                </option>
              ))}
            </optgroup>
          </select>

          <select
            value={receiptTypeFilter}
            onChange={(e) => setReceiptTypeFilter(e.target.value)}
            className="p-2 rounded-lg border border-slate-300 text-xs"
          >
            <option value="all">All Types</option>
            {RECEIPT_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={receiptFromDate}
            onChange={(e) => setReceiptFromDate(e.target.value)}
            className="p-2 rounded-lg border border-slate-300 text-xs"
            aria-label="From date"
          />
          <span className="text-slate-400 text-xs">to</span>
          <input
            type="date"
            value={receiptToDate}
            onChange={(e) => setReceiptToDate(e.target.value)}
            className="p-2 rounded-lg border border-slate-300 text-xs"
            aria-label="To date"
          />

          <input
            type="text"
            value={receiptSessionCodeFilter}
            onChange={(e) => setReceiptSessionCodeFilter(e.target.value)}
            placeholder="Filter by Session ID"
            className="p-2 rounded-lg border border-slate-300 text-xs font-mono w-40"
          />

          {(receiptPersonFilter !== "all" ||
            receiptTypeFilter !== "all" ||
            receiptFromDate ||
            receiptToDate ||
            receiptSessionCodeFilter) && (
            <button
              onClick={() => {
                setReceiptPersonFilter("all");
                setReceiptTypeFilter("all");
                setReceiptFromDate("");
                setReceiptToDate("");
                setReceiptSessionCodeFilter("");
              }}
              className="text-slate-400 hover:text-slate-700 text-xs font-semibold"
            >
              Clear filters
            </button>
          )}
        </div>

        {filteredReceiptRows.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">
            {allReceiptRows.length === 0 ? "No receipts yet." : "No receipts match these filters."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-200">
                  <th className="pb-2 pr-3 font-semibold">Date</th>
                  <th className="pb-2 pr-3 font-semibold">Session ID</th>
                  <th className="pb-2 pr-3 font-semibold">Who</th>
                  <th className="pb-2 pr-3 font-semibold">Type</th>
                  <th className="pb-2 pr-3 font-semibold text-right">Amount</th>
                  <th className="pb-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredReceiptRows.map((r) => (
                  <tr key={r.key} className="border-b border-slate-100">
                    <td className="py-2.5 pr-3 text-slate-700 whitespace-nowrap">
                      {formatDateTime(r.date)}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-400 font-mono">{r.sessionCode ?? "—"}</td>
                    <td className="py-2.5 pr-3">
                      <span className="font-bold text-slate-900">{r.personName}</span>
                      <span className="text-slate-400 capitalize"> · {r.personRole}</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`font-semibold px-2.5 py-1 rounded-full ${
                          r.typeLabel === "Payment Failed" || r.typeLabel === "Refund Failed"
                            ? "text-red-700 bg-red-50"
                            : r.typeLabel === "Payout"
                            ? "text-teal-700 bg-teal-50"
                            : "text-slate-600 bg-slate-100"
                        }`}
                      >
                        {r.typeLabel}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-semibold text-slate-900">
                      {r.amountPaise === null ? "—" : formatInr(r.amountPaise)}
                    </td>
                    <td className="py-2.5">
                      <button
                        onClick={() => setOpenReceipt(r)}
                        className="text-teal-700 font-semibold hover:underline"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {openPatient && (
        <Modal
          title={`Payment History: ${openPatient.patient.full_name ?? "Unknown"}`}
          subtitle={`${openPatient.transactions.length} transaction${openPatient.transactions.length === 1 ? "" : "s"} · Total spent ${formatInr(openPatient.summary.totalSpentPaise)}`}
          onClose={() => setOpenPatientId(null)}
        >
          <PatientTransactionTable transactions={openPatient.transactions} />
        </Modal>
      )}

      {openTherapist && (
        <Modal
          title={`Payout History: ${openTherapist.therapist.full_name ?? "Unknown"}`}
          subtitle={`${openTherapist.transactions.length} settlement${openTherapist.transactions.length === 1 ? "" : "s"} · Total paid out ${formatInr(openTherapist.summary.totalPaidOutPaise)}`}
          onClose={() => setOpenTherapistId(null)}
        >
          <TherapistTransactionTable transactions={openTherapist.transactions} />
        </Modal>
      )}

      {openReceipt && (
        <Modal
          title={`${openReceipt.personName} — ${openReceipt.typeLabel}`}
          subtitle={formatDateTime(openReceipt.date)}
          onClose={() => setOpenReceipt(null)}
        >
          <ReceiptDetail row={openReceipt} />
        </Modal>
      )}
    </div>
  );
}

function ReceiptDetail({ row }: { row: AdminReceiptRow }) {
  const { detail } = row;

  if (detail.kind === "booking") {
    return (
      <div className="space-y-3 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Session / Purpose</span>
          <span className="font-semibold text-slate-800">{detail.title}</span>
        </div>
        {detail.slotTime && (
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Session Time</span>
            <span className="font-semibold text-slate-800">
              {formatSlotTime(detail.slotTime, detail.slotTimezone)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Amount</span>
          <span className="font-semibold text-slate-800">
            {detail.isPackageCovered ? "Covered by package" : formatInr(detail.amountPaise)}
          </span>
        </div>
        {detail.transactionId && (
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Transaction ID</span>
            <span className="font-mono text-slate-600">{detail.transactionId}</span>
          </div>
        )}
      </div>
    );
  }

  if (detail.kind === "payment_failed") {
    return (
      <div className="space-y-3 text-xs">
        {detail.amountPaise !== null && (
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Amount Attempted</span>
            <span className="font-semibold text-slate-800">{formatInr(detail.amountPaise)}</span>
          </div>
        )}
        {detail.errorCode && (
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Error Code</span>
            <span className="font-mono text-slate-600">{detail.errorCode}</span>
          </div>
        )}
        {detail.errorReason && (
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Reason</span>
            <span className="font-semibold text-slate-800">{detail.errorReason}</span>
          </div>
        )}
        {detail.errorDescription && (
          <p className="text-slate-600 pt-2 border-t border-slate-100">{detail.errorDescription}</p>
        )}
      </div>
    );
  }

  // kind === "payout"
  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-slate-500">Total Paid Out</span>
        <span className="font-bold text-teal-700 text-sm">{formatInr(detail.amountPaise)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-slate-500">Method</span>
        <span className="font-semibold text-slate-800">{detail.method}</span>
      </div>
      {detail.note && (
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Note</span>
          <span className="font-semibold text-slate-800">{detail.note}</span>
        </div>
      )}
      <div className="pt-3 border-t border-slate-100">
        <p className="font-semibold text-slate-600 mb-2">
          Sessions covered ({detail.sessionCount})
        </p>
        <ul className="space-y-2">
          {detail.sessions.map((s) => (
            <li
              key={s.appointmentId}
              className="p-3 rounded-lg bg-slate-50 flex items-center justify-between gap-2"
            >
              <div>
                <p className="font-semibold text-slate-800">{s.title}</p>
                <p className="text-slate-500 mt-0.5">
                  {s.patientName} • {formatSlotTime(s.slotTime, null)}
                </p>
              </div>
              <span className="font-semibold text-slate-700">{formatInr(s.amountPaise)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
