"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";
import { formatSlotTime } from "@/lib/formatSlotTime";
import { formatClinicDate } from "@/lib/formatDateTime";
import Spinner from "@/components/system/Spinner";
import { loadRazorpayScript } from "@/lib/razorpay";
import {
  DECLARABLE_METHODS,
  SETTLEMENT_METHOD_LABELS,
  type SettlementMethod,
} from "@/lib/payLaterSettlement";

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

type OwedSession = {
  id: string;
  concern: string | null;
  slot_time: string | null;
  timezone: string | null;
  amount_due_paise: number | null;
};

// What a trusted patient owes, and the two ways to settle it.
//
// **Vocabulary first, because it is the part most easily got wrong.** This
// screen belongs to somebody the clinic chose to trust, so nothing on it reads
// as a collections notice: no "debt", no "outstanding", no "invoice", and no
// "balance" -- that last one is already the patient's word for unspent session
// credits, and using it here would have one word meaning two things on one
// dashboard.
//
// Three states, and keeping them apart is the whole job:
//
//   1. **Owed.** Sessions delivered and not yet settled, each with the price
//      agreed on the day. Pay now, or say you have paid.
//   2. **Being checked.** A declaration is in. The figure has deliberately
//      NOT moved -- a patient who could clear their own total by typing into
//      a box is a patient who can clear their own total by typing into a box
//      -- so this line is the only thing standing between "we know" and
//      "nothing happened".
//   3. **Turned down.** The clinic could not find the money. It carries the
//      reason, because "not confirmed" says the claim is gone and only the
//      reason says what to do next.
//
// Absent entirely when nothing is owed. A card reading ₹0 is a card telling
// somebody about a thing that is not happening.
export default function PayLaterWidget({
  owedPaise,
  sessions,
  unallocatedPaise,
  pendingDeclaration,
  lastRejection,
  razorpayKeyId,
}: {
  owedPaise: number;
  sessions: OwedSession[];
  /** Money the clinic has received that does not yet cover a whole session.
   *  Stated rather than silently netted off, or the total looks wrong against
   *  the sessions listed under it. */
  unallocatedPaise: number;
  pendingDeclaration: { amount_paise: number; method: string; declared_at: string | null } | null;
  lastRejection: { amount_paise: number; rejection_reason: string | null } | null;
  razorpayKeyId: string | null;
}) {
  const [declaring, setDeclaring] = useState(false);
  const [method, setMethod] = useState<SettlementMethod>("upi");
  const [amount, setAmount] = useState(String(Math.round(owedPaise / 100)));
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const busy = useRef(false);
  const amountId = useId();
  const methodId = useId();
  const noteId = useId();
  const referenceId = useId();
  const router = useRouter();
  const { show } = useToast();

  if (owedPaise <= 0 && !pendingDeclaration && !lastRejection) return null;

  async function payNow() {
    // A synchronous ref: a `disabled` attribute lands a render too late to
    // stop the second tap of a double-click, and a second order here is a
    // second charge.
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      const res = await fetch("/api/patient/pay-later/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountPaise: owedPaise }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "We couldn't start that payment. Please try again.");
        return;
      }
      // The shared loader rather than a <Script> tag: it caches one load
      // across callers and retries a flaky one, which is exactly what a
      // payment screen needs and what a bare tag does not give.
      await loadRazorpayScript();
      const checkout = new window.Razorpay({
        key: data.keyId ?? razorpayKeyId,
        amount: data.amountPaise,
        currency: "INR",
        order_id: data.orderId,
        name: "Dr. Pooja's Physio",
        description: "Payment for sessions you've had",
        // Nothing is settled here. The capture confirms the payment and
        // closes the sessions it covers inside one database transaction, so
        // this callback only has to bring the screen up to date.
        handler: () => {
          show("Thank you - your payment is on its way to us.");
          router.refresh();
        },
        theme: { color: "#0f766e" },
      });
      checkout.open();
    } catch {
      setError("We couldn't reach the server. Please check your connection and try again.");
    } finally {
      busy.current = false;
    }
  }

  async function declare() {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      const rupees = Number(amount);
      const res = await fetch("/api/patient/declare-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountPaise: Number.isFinite(rupees) ? Math.round(rupees * 100) : 0,
          method,
          note,
          reference,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "We couldn't record that. Please try again.");
        return;
      }
      show("Thank you - we'll check and confirm it shortly.");
      setDeclaring(false);
      setNote("");
      setReference("");
      // The control releases here; the refresh is handed to the progress bar.
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Please check your connection and try again.");
    } finally {
      busy.current = false;
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-teal-200 bg-teal-50 p-5">
      {owedPaise > 0 && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
            You owe so far
          </p>
          <p className="mt-1 text-3xl font-bold text-teal-900">{formatInr(owedPaise)}</p>
          <p className="mt-1 text-xs text-slate-600">
            For {sessions.length} session{sessions.length === 1 ? "" : "s"} you&apos;ve
            already had. Settle whenever suits you.
          </p>
        </>
      )}

      {unallocatedPaise > 0 && (
        // Received and not yet covering a whole session. Said out loud,
        // because a total that quietly went down by less than was paid reads
        // as an error.
        <p className="mt-2 text-xs font-semibold text-teal-800">
          {formatInr(unallocatedPaise)} of your last payment is held against your next
          session.
        </p>
      )}

      {sessions.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-teal-200 pt-3">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-slate-700">
                {s.concern ?? "Session"}
                {s.slot_time ? ` - ${formatSlotTime(s.slot_time, s.timezone)}` : ""}
              </span>
              {/* The price agreed on the day, not today's. A session settled
                  months later is settled at what it cost then. */}
              <span className="shrink-0 font-semibold text-slate-900">
                {formatInr(Math.max(0, s.amount_due_paise ?? 0))}
              </span>
            </li>
          ))}
        </ul>
      )}

      {pendingDeclaration ? (
        // State 2. Informational, never a to-do: there is nothing for them to
        // do, and the figure above has deliberately not moved.
        <p className="mt-4 rounded-xl bg-white p-3 text-xs text-slate-700">
          <span className="font-semibold text-slate-900">We&apos;re checking your payment.</span>{" "}
          You told us about {formatInr(pendingDeclaration.amount_paise)}
          {pendingDeclaration.declared_at
            ? ` on ${formatClinicDate(pendingDeclaration.declared_at)}`
            : ""}
          . It still shows above until we&apos;ve found it - we&apos;ll confirm shortly.
        </p>
      ) : (
        <div className="mt-4">
          {lastRejection && (
            // State 3. The reason is the actionable half.
            <p className="mb-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
              <span className="font-semibold">
                We couldn&apos;t find the {formatInr(lastRejection.amount_paise)} you told us
                about.
              </span>
              {lastRejection.rejection_reason ? ` ${lastRejection.rejection_reason}` : ""}
            </p>
          )}

          {!declaring ? (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => startTransition(payNow)}
                disabled={isPending || owedPaise <= 0}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-teal-800 disabled:opacity-60"
              >
                {isPending && <Spinner />}
                Pay {formatInr(owedPaise)} now
              </button>
              <button
                onClick={() => setDeclaring(true)}
                disabled={owedPaise <= 0}
                className="rounded-xl border border-teal-300 bg-white px-4 py-2 text-xs font-semibold text-teal-800 transition hover:bg-teal-100 disabled:opacity-60"
              >
                I&apos;ve already paid
              </button>
            </div>
          ) : (
            <div className="rounded-xl bg-white p-4">
              <p className="text-xs font-semibold text-slate-900">Tell us about your payment</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                We&apos;ll check and confirm it. Nothing changes above until we have.
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor={amountId} className="block text-[11px] font-semibold text-slate-700">
                    How much (₹)
                  </label>
                  <input
                    id={amountId}
                    type="number"
                    min={1}
                    max={Math.round(owedPaise / 100)}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                  />
                </div>
                <div>
                  <label htmlFor={methodId} className="block text-[11px] font-semibold text-slate-700">
                    How you paid
                  </label>
                  <select
                    id={methodId}
                    value={method}
                    onChange={(e) => setMethod(e.target.value as SettlementMethod)}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                  >
                    {DECLARABLE_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {SETTLEMENT_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-3">
                <label htmlFor={referenceId} className="block text-[11px] font-semibold text-slate-700">
                  Reference, if you have one
                </label>
                <input
                  id={referenceId}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="UTR or transaction number"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>

              <div className="mt-3">
                <label htmlFor={noteId} className="block text-[11px] font-semibold text-slate-700">
                  Anything else we should know
                </label>
                <textarea
                  id={noteId}
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Sent from HDFC around 2pm"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => startTransition(declare)}
                  disabled={isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-teal-800 disabled:opacity-60"
                >
                  {isPending && <Spinner />}
                  Tell the clinic
                </button>
                <button
                  onClick={() => setDeclaring(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
