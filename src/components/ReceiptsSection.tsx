"use client";

import { useState } from "react";
import Modal from "@/components/admin/Modal";
import type { PatientReceipt, BookingReceiptStage } from "@/lib/receipts";
import { formatSlotTime } from "@/lib/formatSlotTime";

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}

function formatDateHeading(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

const STAGE_LABEL: Record<BookingReceiptStage, string> = {
  payment_confirmed: "Payment Confirmed",
  service_completed: "Service Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  refund_failed: "Refund Failed",
};

const STAGE_PILL_STYLE: Record<BookingReceiptStage, string> = {
  payment_confirmed: "text-teal-800 bg-teal-100",
  service_completed: "text-blue-800 bg-blue-100",
  cancelled: "text-slate-600 bg-slate-100",
  refunded: "text-slate-600 bg-slate-100",
  refund_failed: "text-red-800 bg-red-100",
};

export default function ReceiptsSection({
  receipts,
  sessionCodeByAppointmentId,
}: {
  receipts: PatientReceipt[];
  // Keyed by appointmentId -- session_code is new/migration-dependent (see
  // supabase/schema.sql's "Unique display IDs" section) so it's kept out of
  // the pure receipts.ts aggregation helpers and looked up here instead.
  sessionCodeByAppointmentId?: Record<string, string | null>;
}) {
  const [selected, setSelected] = useState<PatientReceipt | null>(null);

  return (
    <div className="mt-8">
      <h2 className="font-bold text-lg text-slate-800 mb-1">Receipts</h2>
      <p className="text-xs text-slate-500 mb-4">
        A record of every payment, completed session, and payment attempt on your account.
      </p>

      {receipts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <p className="text-xs text-slate-500 py-8 text-center">
            Nothing to show yet — receipts appear here once you make a payment.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {receipts.map((r) => {
            const pillLabel = r.kind === "booking" ? STAGE_LABEL[r.stage] : "Payment Failed";
            const pillStyle =
              r.kind === "booking" ? STAGE_PILL_STYLE[r.stage] : "text-red-800 bg-red-100";
            const sessionCode = r.appointmentId
              ? sessionCodeByAppointmentId?.[r.appointmentId] ?? null
              : null;
            const amountLabel =
              r.kind === "booking"
                ? r.isPackageCovered
                  ? "Covered by package"
                  : formatInr(r.amountPaise)
                : r.amountPaise !== null
                ? formatInr(r.amountPaise)
                : "—";
            return (
              <div
                key={`${r.kind}-${r.id}`}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-[11px] text-slate-400">
                      {r.kind === "booking" ? "Payment Date" : "Payment Attempted"}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <p className="text-xl font-bold text-slate-900">{formatDateHeading(r.date)}</p>
                      <span className={`font-semibold text-[11px] px-2.5 py-1 rounded-full ${pillStyle}`}>
                        {pillLabel}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-slate-900">{amountLabel}</p>
                    <button
                      type="button"
                      onClick={() => setSelected(r)}
                      className="text-teal-700 font-semibold text-xs hover:underline"
                    >
                      See More <i className="fa-solid fa-chevron-down text-[10px] ml-0.5"></i>
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-500 mt-3">
                  {r.title}
                  {sessionCode && (
                    <span className="ml-2 font-mono text-slate-400">{sessionCode}</span>
                  )}
                </p>

                <div className="mt-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setSelected(r)}
                    className="text-teal-700 font-semibold text-xs hover:underline inline-flex items-center gap-1.5"
                  >
                    View Payment Details <i className="fa-solid fa-circle-info"></i>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <Modal
          title={selected.title}
          subtitle={formatDateTime(selected.date)}
          onClose={() => setSelected(null)}
        >
          {selected.kind === "booking" ? (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Status</span>
                <span
                  className={`font-semibold px-3 py-1 rounded-full ${STAGE_PILL_STYLE[selected.stage]}`}
                >
                  {STAGE_LABEL[selected.stage]}
                </span>
              </div>
              {selected.appointmentId && sessionCodeByAppointmentId?.[selected.appointmentId] && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Session ID</span>
                  <span className="font-mono text-slate-600">
                    {sessionCodeByAppointmentId[selected.appointmentId]}
                  </span>
                </div>
              )}
              {selected.slotTime && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Session Time</span>
                  <span className="font-semibold text-slate-800">
                    {formatSlotTime(selected.slotTime, selected.slotTimezone)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Amount</span>
                <span className="font-semibold text-slate-800">
                  {selected.isPackageCovered ? "Covered by package" : formatInr(selected.amountPaise)}
                </span>
              </div>
              {selected.transactionId && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Transaction ID</span>
                  <span className="font-mono text-slate-600">{selected.transactionId}</span>
                </div>
              )}
              {(selected.stage === "refund_failed" || selected.stage === "refunded") && (
                <p className="text-slate-500 pt-2 border-t border-slate-100">
                  {selected.stage === "refund_failed"
                    ? "The refund for this cancelled session couldn't be processed automatically — please contact us."
                    : "This session was cancelled and refunded."}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Status</span>
                <span className="font-semibold text-red-800 bg-red-100 px-3 py-1 rounded-full">
                  Failed
                </span>
              </div>
              {selected.amountPaise !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Amount Attempted</span>
                  <span className="font-semibold text-slate-800">
                    {formatInr(selected.amountPaise)}
                  </span>
                </div>
              )}
              <p className="text-slate-600 pt-2 border-t border-slate-100">
                {selected.errorDescription ||
                  selected.errorReason ||
                  "The payment didn't go through — this can happen for reasons like a declined card or a bank timeout. You can try again from your session or package above."}
              </p>
              {selected.errorCode && (
                <p className="text-slate-400">Reference code: {selected.errorCode}</p>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
