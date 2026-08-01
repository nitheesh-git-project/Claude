"use client";

import { useState } from "react";
import Modal from "@/components/admin/Modal";
import type { PayoutReceipt } from "@/lib/receipts";
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

export default function TherapistPayoutReceiptsSection({
  receipts,
}: {
  receipts: PayoutReceipt[];
}) {
  const [selected, setSelected] = useState<PayoutReceipt | null>(null);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mt-8">
      <h2 className="font-bold text-lg text-slate-800 mb-1">Payout Receipts</h2>
      <p className="text-xs text-slate-500 mb-4">
        A record of every settlement paid out to you, and exactly which sessions each one covered.
      </p>

      {receipts.length === 0 ? (
        <p className="text-xs text-slate-500 py-8 text-center">
          No payouts settled yet — this fills in once the clinic pays you out.
        </p>
      ) : (
        <ul className="space-y-2">
          {receipts.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setSelected(r)}
                className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-teal-300 transition text-xs flex items-center justify-between gap-2 flex-wrap"
              >
                <div>
                  <p className="font-bold text-slate-900">
                    {r.sessionCount} session{r.sessionCount === 1 ? "" : "s"} settled
                  </p>
                  <p className="text-slate-500 mt-1">
                    {formatDate(r.settledAt)} • {r.method}
                  </p>
                </div>
                <span className="font-bold text-teal-700">{formatInr(r.amountPaise)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <Modal
          title={`${selected.sessionCount} session${selected.sessionCount === 1 ? "" : "s"} settled`}
          subtitle={formatDate(selected.settledAt)}
          onClose={() => setSelected(null)}
        >
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Total Paid Out</span>
              <span className="font-bold text-teal-700 text-sm">{formatInr(selected.amountPaise)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Method</span>
              <span className="font-semibold text-slate-800">{selected.method}</span>
            </div>
            {selected.note && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Note</span>
                <span className="font-semibold text-slate-800">{selected.note}</span>
              </div>
            )}

            <div className="pt-3 border-t border-slate-100">
              <p className="font-semibold text-slate-600 mb-2">Sessions covered</p>
              <ul className="space-y-2">
                {selected.sessions.map((s) => (
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
        </Modal>
      )}
    </div>
  );
}
