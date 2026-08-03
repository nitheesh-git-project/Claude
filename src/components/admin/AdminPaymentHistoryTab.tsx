"use client";

import { useState } from "react";
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

type Patient = { id: string; full_name: string | null };
type Therapist = { id: string; full_name: string | null };
type Category = { id: string; title: string };

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function PatientTransactionTable({ transactions }: { transactions: PatientTransaction[] }) {
  if (transactions.length === 0) {
    return <p className="text-xs text-slate-500 py-6 text-center">No payments recorded yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-400 border-b border-slate-200">
            <th className="pb-2 pr-3 font-semibold">Date</th>
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
    return <p className="text-xs text-slate-500 py-6 text-center">No payouts settled yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-400 border-b border-slate-200">
            <th className="pb-2 pr-3 font-semibold">Date</th>
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
  categories,
}: {
  patients: Patient[];
  therapists: Therapist[];
  appointments: PaymentAppointment[];
  packagePurchases: PackagePurchase[];
  categories: Category[];
}) {
  const [openPatientId, setOpenPatientId] = useState<string | null>(null);
  const [openTherapistId, setOpenTherapistId] = useState<string | null>(null);

  const categoryTitleById = new Map(categories.map((c) => [c.id, c.title]));
  const patientNameById = new Map(patients.map((p) => [p.id, p.full_name ?? "Unknown"]));

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

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h2 className="font-bold text-lg text-slate-800">Patient Payment History</h2>
          <p className="text-xs text-slate-500">
            Money in, all-time: <strong className="text-teal-700">{formatInr(totalPatientSpendPaise)}</strong>
          </p>
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
                  <td className="py-2.5 pr-3 text-slate-400 font-mono">{patient.id.slice(0, 8)}</td>
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
          <p className="text-xs text-slate-500 py-6 text-center">No patients yet.</p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h2 className="font-bold text-lg text-slate-800">Therapist Payment History</h2>
          <p className="text-xs text-slate-500">
            Money out, all-time: <strong className="text-teal-700">{formatInr(totalTherapistPaidOutPaise)}</strong>
          </p>
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
                  <td className="py-2.5 pr-3 text-slate-400 font-mono">{therapist.id.slice(0, 8)}</td>
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
          <p className="text-xs text-slate-500 py-6 text-center">No therapists yet.</p>
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
    </div>
  );
}
