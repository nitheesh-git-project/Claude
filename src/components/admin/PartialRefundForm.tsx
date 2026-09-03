"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useConfirm } from "@/lib/useConfirm";

// A refund for an amount the admin chooses, on a session that has a real
// Razorpay payment behind it.
//
// The automatic rule (full outside the cancellation window, none inside)
// still runs on cancellation and is untouched. This is the case that rule
// cannot express, and it is deliberately more work to use: an amount, a
// stated reason, and a confirmation naming the figure -- because money
// leaving the business on someone's judgement should leave a trail saying
// whose judgement it was.
export default function PartialRefundForm({
  appointmentId,
  paidPaise,
  alreadyRefundedPaise,
}: {
  appointmentId: string;
  paidPaise: number;
  alreadyRefundedPaise: number;
}) {
  const [open, setOpen] = useState(false);
  const [amountInr, setAmountInr] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  const remainingPaise = paidPaise - alreadyRefundedPaise;
  if (remainingPaise <= 0) {
    return (
      <p className="text-[11px] text-slate-400">
        Fully refunded — ₹{(alreadyRefundedPaise / 100).toLocaleString("en-IN")} returned.
      </p>
    );
  }

  async function handleSubmit() {
    setError(null);
    const rupees = Number(amountInr);
    // Checked here so an obvious mistake is caught before a round trip; the
    // route re-checks all of it, since a browser is never the authority on
    // how much money may leave.
    if (!Number.isFinite(rupees) || rupees <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    const paise = Math.round(rupees * 100);
    if (paise > remainingPaise) {
      setError(
        `Only ₹${(remainingPaise / 100).toLocaleString("en-IN")} is still refundable on this session.`
      );
      return;
    }
    if (!reason.trim()) {
      setError("Say why this refund is being made.");
      return;
    }

    const ok = await confirm(
      `Refund ₹${rupees.toLocaleString("en-IN")} to the patient via Razorpay? This cannot be undone from here.`
    );
    if (!ok) return;

    startTransition(async () => {
      const res = await fetch("/api/admin/refund-session-partial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ appointmentId, amountPaise: paise, reason: reason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not refund.");
        return;
      }
      setOpen(false);
      setAmountInr("");
      setReason("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] font-semibold text-slate-600 hover:underline"
      >
        Refund part of this payment
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] text-slate-500">
        ₹{(remainingPaise / 100).toLocaleString("en-IN")} of ₹
        {(paidPaise / 100).toLocaleString("en-IN")} is still refundable.
      </p>
      <input
        type="number"
        min="1"
        step="1"
        value={amountInr}
        onChange={(e) => setAmountInr(e.target.value)}
        placeholder="Amount in ₹"
        className="w-full rounded-lg border border-slate-300 p-2 text-xs"
      />
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Why (recorded in the activity log)"
        className="w-full rounded-lg border border-slate-300 p-2 text-xs"
      />
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={isPending}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
        >
          {isPending ? "Refunding…" : "Refund"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-[11px] text-slate-500 hover:underline"
        >
          Cancel
        </button>
      </div>
      {dialog}
    </div>
  );
}
