"use client";

import { useState } from "react";
import Modal from "@/components/admin/Modal";
import type { PatientReceipt, BookingReceiptStage } from "@/lib/receipts";
import { formatSlotTime } from "@/lib/formatSlotTime";

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
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

const STAGE_STYLE: Record<BookingReceiptStage, string> = {
  payment_confirmed: "text-teal-700 bg-teal-50",
  service_completed: "text-blue-700 bg-blue-50",
  cancelled: "text-slate-600 bg-slate-100",
  refunded: "text-slate-600 bg-slate-100",
  refund_failed: "text-red-700 bg-red-50",
};

export default function ReceiptsSection({ receipts }: { receipts: PatientReceipt[] }) {
  const [selected, setSelected] = useState<PatientReceipt | null>(null);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mt-8">
      <h2 className="font-bold text-lg text-slate-800 mb-1">Receipts</h2>
      <p className="text-xs text-slate-500 mb-4">
        A record of every payment, completed session, and payment attempt on your account.
      </p>

      {receipts.length === 0 ? (
        <p className="text-xs text-slate-500 py-8 text-center">
          Nothing to show yet — receipts appear here once you make a payment.
        </p>
      ) : (
        <ul className="space-y-2">
          {receipts.map((r) => (
            <li key={`${r.kind}-${r.id}`}>
              <button
                type="button"
                onClick={() => setSelected(r)}
                className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-teal-300 transition text-xs flex items-center justify-between gap-2 flex-wrap"
              >
                <div>
                  <p className="font-bold text-slate-900">{r.title}</p>
                  <p className="text-slate-500 mt-1">{formatDate(r.date)}</p>
                </div>
                {r.kind === "booking" ? (
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-semibold px-3 py-1 rounded-full ${STAGE_STYLE[r.stage]}`}
                    >
                      {STAGE_LABEL[r.stage]}
                    </span>
                    <span className="font-semibold text-slate-700">
                      {r.isPackageCovered ? "Covered by package" : formatInr(r.amountPaise)}
                    </span>
                  </div>
                ) : (
                  <span className="font-semibold text-red-700 bg-red-50 px-3 py-1 rounded-full">
                    Payment Failed
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <Modal
          title={selected.title}
          subtitle={formatDate(selected.date)}
          onClose={() => setSelected(null)}
        >
          {selected.kind === "booking" ? (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Status</span>
                <span
                  className={`font-semibold px-3 py-1 rounded-full ${STAGE_STYLE[selected.stage]}`}
                >
                  {STAGE_LABEL[selected.stage]}
                </span>
              </div>
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
                <span className="font-semibold text-red-700 bg-red-50 px-3 py-1 rounded-full">
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
