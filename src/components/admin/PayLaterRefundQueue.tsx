"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";
import Spinner from "@/components/system/Spinner";
import { formatClinicDate, formatClinicDateShort } from "@/lib/formatDateTime";
import type { PayLaterRefundRow } from "@/lib/payLaterSettlementServer";

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

// Money the clinic has agreed to give back to a trusted patient and has not
// given back yet.
//
// The mirror of `PayLaterSettlementQueue` one direction over, and it exists
// for a reason that is not symmetry: a settled pay-later session carries no
// gateway payment to reverse -- the money arrived as one settlement covering
// several sessions -- so nothing moves it but a person. Without this queue the
// money alert counting these rows would link to a screen that could not act on
// them, which is worse than not counting them at all.
//
// Oldest first, same as the settlement queue and for the same reason: the
// person who has waited longest is the one this is for. Unlike that queue
// there is no second outcome -- a refund the clinic decided on is not
// something an admin can turn down here; undoing it means a fresh decision on
// the session itself.
export default function PayLaterRefundQueue({
  refunds,
  patientNameById,
}: {
  refunds: PayLaterRefundRow[];
  patientNameById: Map<string, string>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const busy = useRef(false);
  const router = useRouter();
  const { show } = useToast();

  if (refunds.length === 0) return null;

  const totalPaise = refunds.reduce((sum, r) => sum + Math.max(0, r.refund_amount_paise ?? 0), 0);

  async function confirmReturned(appointmentId: string, amountPaise: number) {
    // A synchronous ref: two taps are two answers about one patient's money.
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      const res = await fetch("/api/admin/mark-cash-refund-returned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Could not save. Please try again.");
        return;
      }
      show(`${formatInr(amountPaise)} marked as handed back.`);
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      busy.current = false;
    }
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">Refunds to hand back</h3>
        <span className="text-xs font-semibold text-slate-700">{formatInr(totalPaise)}</span>
      </div>
      <p className="mt-1 text-xs text-slate-700">
        These sessions were settled and then refunded. The money came in as one payment
        covering several sessions, so there is no card payment to reverse - somebody has to
        send it back. Until then the patient is out of pocket.
      </p>

      <ul className="mt-4 space-y-3">
        {refunds.map((r) => {
          const amountPaise = Math.max(0, r.refund_amount_paise ?? 0);
          return (
            <li key={r.id} className="rounded-xl border border-amber-200 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-bold text-slate-900">
                  {patientNameById.get(r.patient_id) ?? "Unknown patient"}
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {formatInr(amountPaise)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-600">
                {r.slot_time ? `Session ${formatClinicDateShort(r.slot_time)}` : "Session"}
                {r.refunded_at ? ` · agreed ${formatClinicDate(r.refunded_at)}` : ""}
              </p>
              {/* Why the clinic agreed to it. The person sending the money is
                  often not the person who decided, and "send ₹1,200 to
                  Lakshmi" with no reason is a request nobody can check. */}
              {r.refund_reason && (
                <p className="mt-1 text-xs text-slate-700">{r.refund_reason}</p>
              )}
              <button
                onClick={() => startTransition(() => confirmReturned(r.id, amountPaise))}
                disabled={isPending}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
              >
                {isPending && <Spinner />}
                Confirm handed back
              </button>
            </li>
          );
        })}
      </ul>

      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
