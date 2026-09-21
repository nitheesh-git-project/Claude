"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";
import Spinner from "@/components/system/Spinner";
import { formatClinicDate } from "@/lib/formatDateTime";
import {
  SETTLEMENT_METHOD_LABELS,
  SETTLEMENT_REJECTION_MIN_CHARS,
  isStaleSettlement,
  settlementWaitDays,
  type SettlementMethod,
} from "@/lib/payLaterSettlement";

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export type QueuedSettlement = {
  id: string;
  patient_id: string;
  amount_paise: number;
  method: string;
  note?: string | null;
  reference?: string | null;
  declared_at: string | null;
};

// Payments a patient says they have made, waiting for somebody to check.
//
// Oldest first, arriving that way from the server, for the reason the
// recommendation queue is: this is work with a person waiting behind it, and
// a newest-first queue leaves whoever has waited longest at the bottom.
//
// The asymmetry between the two buttons is deliberate and matches the routes.
// **Confirm is one tap** -- it is the outcome this queue exists to reach, and
// taxing it with a sentence meaning "the money is there" is how a reason
// column fills with "ok" and stops being worth reading. **Reject asks for ten
// characters**, because that is the outcome that takes something away: the
// patient believes they have paid, and the reason is the only half of the
// answer they can act on. It reaches them on their own dashboard.
export default function PayLaterSettlementQueue({
  settlements,
  patientNameById,
  nowMs,
}: {
  settlements: QueuedSettlement[];
  patientNameById: Map<string, string>;
  nowMs: number;
}) {
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const busy = useRef(false);
  const router = useRouter();
  const { show } = useToast();

  async function send(path: string, body: Record<string, unknown>, done: string) {
    // A synchronous ref, because a `disabled` attribute lands a render too
    // late -- and two taps here are two answers to one payment.
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Could not save. Please try again.");
        return;
      }
      show(done);
      setRejecting(null);
      setReason("");
      // Busy for its own request; the refresh is handed to the progress bar.
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      busy.current = false;
    }
  }

  if (settlements.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">Payments waiting</h3>
        <span className="text-xs text-slate-500">
          {settlements.length} to check
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        A patient has told us they have paid. Until one of these is answered, what they
        owe above still includes it - and they cannot tell whether anybody has looked.
      </p>

      <ul className="mt-4 space-y-3">
        {settlements.map((s) => {
          const waited = settlementWaitDays(s.declared_at, nowMs);
          const stale = isStaleSettlement(s.declared_at, nowMs);
          return (
            <li
              key={s.id}
              className={`rounded-xl border p-4 ${
                stale ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-bold text-slate-900">
                  {patientNameById.get(s.patient_id) ?? "Unknown patient"}
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {formatInr(s.amount_paise)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-600">
                {SETTLEMENT_METHOD_LABELS[s.method as SettlementMethod] ?? s.method}
                {s.declared_at ? ` · told us ${formatClinicDate(s.declared_at)}` : ""}
                {waited !== null ? ` · ${waited} day${waited === 1 ? "" : "s"} ago` : ""}
              </p>
              {s.reference && (
                <p className="mt-1 text-xs text-slate-700">
                  <span className="font-semibold text-slate-900">Reference:</span>{" "}
                  {s.reference}
                </p>
              )}
              {s.note && <p className="mt-1 text-xs text-slate-700">{s.note}</p>}

              {rejecting === s.id ? (
                <div className="mt-3">
                  <label
                    htmlFor={`reject-${s.id}`}
                    className="block text-[11px] font-semibold text-slate-800"
                  >
                    Why you could not find it
                  </label>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    At least {SETTLEMENT_REJECTION_MIN_CHARS} characters. The patient reads
                    this, and it is the only thing telling them what to do next.
                  </p>
                  <textarea
                    id={`reject-${s.id}`}
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Nothing matching this reference has reached the account - please check and send us the transaction number."
                    className="mt-1.5 w-full rounded-lg border border-slate-300 p-2 text-xs"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() =>
                        startTransition(() =>
                          send(
                            "/api/admin/reject-pay-later-payment",
                            { paymentId: s.id, reason },
                            "Turned down. The patient has been told why."
                          )
                        )
                      }
                      disabled={
                        isPending || reason.trim().length < SETTLEMENT_REJECTION_MIN_CHARS
                      }
                      className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60"
                    >
                      {isPending && <Spinner />}
                      Turn it down
                    </button>
                    <button
                      onClick={() => {
                        setRejecting(null);
                        setReason("");
                      }}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() =>
                      startTransition(() =>
                        send(
                          "/api/admin/confirm-pay-later-payment",
                          { paymentId: s.id },
                          "Confirmed. The sessions it covers are settled."
                        )
                      )
                    }
                    disabled={isPending}
                    className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
                  >
                    {isPending && <Spinner />}
                    Confirm it arrived
                  </button>
                  <button
                    onClick={() => setRejecting(s.id)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-white"
                  >
                    Could not find it
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
