"use client";

import { useState } from "react";
import Modal from "@/components/admin/Modal";
import type { PayoutReceipt } from "@/lib/receipts";
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

export default function TherapistPayoutReceiptsSection({
  receipts,
  sessionCodeByAppointmentId,
}: {
  receipts: PayoutReceipt[];
  // Keyed by appointmentId -- session_code is new/migration-dependent (see
  // supabase/schema.sql's "Unique display IDs" section) so it's kept out of
  // the pure receipts.ts aggregation helpers and looked up here instead.
  sessionCodeByAppointmentId?: Record<string, string | null>;
}) {
  const [selected, setSelected] = useState<PayoutReceipt | null>(null);

  return (
    <div className="mt-8">
      <h2 className="font-bold text-lg text-slate-800 mb-1">Payout Receipts</h2>
      <p className="text-xs text-slate-500 mb-4">
        A record of every settlement paid out to you, and exactly which sessions each one covered.
      </p>

      {receipts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <p className="text-xs text-slate-500 py-8 text-center">
            No payouts settled yet — this fills in once the clinic pays you out.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {receipts.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-[11px] text-slate-400">Payout Date</p>
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    <p className="text-xl font-bold text-slate-900">{formatDateHeading(r.settledAt)}</p>
                    <span className="font-semibold text-[11px] px-2.5 py-1 rounded-full text-teal-800 bg-teal-100">
                      Paid
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-slate-900">{formatInr(r.amountPaise)}</p>
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
                {r.sessionCount} session{r.sessionCount === 1 ? "" : "s"} settled • {r.method}
              </p>

              <div className="mt-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelected(r)}
                  className="text-teal-700 font-semibold text-xs hover:underline inline-flex items-center gap-1.5"
                >
                  View Payout Details <i className="fa-solid fa-circle-info"></i>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <Modal
          title={`${selected.sessionCount} session${selected.sessionCount === 1 ? "" : "s"} settled`}
          subtitle={formatDateTime(selected.settledAt)}
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
                      <p className="font-semibold text-slate-800">
                        {s.title}
                        {sessionCodeByAppointmentId?.[s.appointmentId] && (
                          <span className="ml-2 font-mono font-normal text-slate-400">
                            {sessionCodeByAppointmentId[s.appointmentId]}
                          </span>
                        )}
                      </p>
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
