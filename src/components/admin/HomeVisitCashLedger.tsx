"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatSlotTime } from "@/lib/formatSlotTime";
import { useConfirm } from "@/lib/useConfirm";
import {
  computeTherapistCashSummary,
  oldestUnremittedAgeDays,
  type CashAppointment,
} from "@/lib/therapistCashLedger";
import type { HomeVisitRow } from "@/components/admin/HomeVisitQueue";

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function MarkRemittedButton({ appointmentId, amountPaise }: { appointmentId: string; amountPaise: number }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function handleClick() {
    // Every other money-moving button in this app (TherapistPayoutButton,
    // CollectCashButton) confirms before firing -- this one and its refund
    // twin below were the two exceptions. The server-side CAS guard already
    // makes a double-click harmless, but that's not the same thing as
    // meaning to click it once.
    if (!(await confirm(`Mark ${formatInr(amountPaise)} as remitted by this therapist? This can't be undone.`))) {
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/admin/mark-cash-remitted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId }),
      });
      if (res.ok) router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isPending}
        className="rounded-lg bg-teal-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
      >
        {isPending ? "Saving..." : "Mark remitted"}
      </button>
      {dialog}
    </>
  );
}

function MarkRefundReturnedButton({ appointmentId, amountPaise }: { appointmentId: string; amountPaise: number }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function handleClick() {
    if (
      !(await confirm(
        `Mark ${formatInr(amountPaise)} as handed back to the patient? This can't be undone.`
      ))
    ) {
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/admin/mark-cash-refund-returned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId }),
      });
      if (res.ok) router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isPending}
        className="rounded-lg bg-red-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
      >
        {isPending ? "Saving..." : "Mark refunded"}
      </button>
      {dialog}
    </>
  );
}

function TherapistCashCard({
  therapistName,
  visits,
  nowMs,
}: {
  therapistName: string;
  visits: HomeVisitRow[];
  nowMs: number;
}) {
  const therapistId = visits[0]?.therapist_id ?? "";
  const cashAppointments: CashAppointment[] = visits.map((v) => ({
    id: v.id,
    therapist_id: v.therapist_id,
    cash_collected_at: v.cash_collected_at,
    cash_collected_amount_paise: v.cash_collected_amount_paise,
    cash_remitted_at: v.cash_remitted_at,
  }));
  const summary = computeTherapistCashSummary(therapistId, cashAppointments);
  const ageDays = oldestUnremittedAgeDays(cashAppointments, nowMs);
  const outstanding = visits.filter((v) => v.cash_collected_at && !v.cash_remitted_at);

  if (summary.collectedPaise === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 p-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-slate-900">{therapistName}</p>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-2.5 py-1 font-semibold ${
              summary.heldPaise > 0 ? "text-amber-700 bg-amber-50" : "text-teal-700 bg-teal-50"
            }`}
          >
            Holding {formatInr(summary.heldPaise)}
          </span>
          <span className="text-slate-400">Remitted {formatInr(summary.remittedPaise)}</span>
        </div>
      </div>

      {ageDays !== null && (
        <p className={`mt-1 ${ageDays >= 7 ? "font-semibold text-red-600" : "text-slate-400"}`}>
          Oldest uncollected: {ageDays} day{ageDays === 1 ? "" : "s"} ago
          {ageDays >= 7 && " — follow up"}
        </p>
      )}

      {outstanding.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          {outstanding.map((v) => (
            <li
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2.5"
            >
              <span className="text-slate-600">
                <span className="font-mono">{v.session_code ?? "—"}</span>
                {v.slot_time && ` · ${formatSlotTime(v.slot_time, v.timezone)}`}
                {" · "}
                <span className="font-semibold text-slate-800">
                  {formatInr(v.cash_collected_amount_paise ?? 0)}
                </span>
              </span>
              <MarkRemittedButton appointmentId={v.id} amountPaise={v.cash_collected_amount_paise ?? 0} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function HomeVisitCashLedger({
  visits,
  nowMs,
}: {
  visits: HomeVisitRow[];
  nowMs: number;
}) {
  const byTherapist = new Map<string, HomeVisitRow[]>();
  for (const v of visits) {
    if (!v.therapist_id || !v.cash_collected_at) continue;
    const list = byTherapist.get(v.therapist_id) ?? [];
    list.push(v);
    byTherapist.set(v.therapist_id, list);
  }

  const totalHeldPaise = visits
    .filter((v) => v.cash_collected_at && !v.cash_remitted_at)
    .reduce((sum, v) => sum + (v.cash_collected_amount_paise ?? 0), 0);

  // Cancelled cash bookings where money was already collected -- see
  // cancelAppointmentAndRefund's willRefundCashManually branch. There is no
  // Razorpay payment behind cash, so nothing refunds itself; this is the
  // action queue that keeps one from silently stranding.
  const manualPendingRefunds = visits.filter((v) => v.refund_status === "manual_pending");

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-bold text-sm text-slate-800">Cash Ledger</h3>
        <p className="mt-1 text-xs text-slate-500">
          Cash a therapist has collected at the door but not yet handed over. Currently held across
          everyone: <strong className="text-amber-700">{formatInr(totalHeldPaise)}</strong>.
        </p>
      </div>

      {manualPendingRefunds.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="font-bold text-sm text-red-800">
            Cash refunds owed ({manualPendingRefunds.length})
          </p>
          <p className="mt-1 text-xs text-red-700">
            These visits were cancelled after cash was already collected. There is no automatic way
            to return cash — hand it back to the patient, then clear it below.
          </p>
          <ul className="mt-3 space-y-2">
            {manualPendingRefunds.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-2.5 text-xs"
              >
                <span className="text-slate-700">
                  <span className="font-mono">{v.session_code ?? "—"}</span> · {v.patientName} ·{" "}
                  <span className="font-semibold">{formatInr(v.refund_amount_paise ?? v.cash_collected_amount_paise ?? 0)}</span>
                </span>
                <MarkRefundReturnedButton
                  appointmentId={v.id}
                  amountPaise={v.refund_amount_paise ?? v.cash_collected_amount_paise ?? 0}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {byTherapist.size === 0 ? (
        <p className="py-6 text-center text-xs text-slate-500">No cash has been collected yet.</p>
      ) : (
        <div className="space-y-3">
          {[...byTherapist.entries()].map(([therapistId, therapistVisits]) => (
            <TherapistCashCard
              key={therapistId}
              therapistName={therapistVisits[0].therapistName ?? "Unknown"}
              visits={therapistVisits}
              nowMs={nowMs}
            />
          ))}
        </div>
      )}
    </div>
  );
}
