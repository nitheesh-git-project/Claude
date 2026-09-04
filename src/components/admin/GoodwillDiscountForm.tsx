"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";

const MIN_REASON_LENGTH = 10;

/**
 * Taking an amount off one unpaid session, for one patient.
 *
 * The counterpart of `PartialRefundForm` on the other side of the payment:
 * a refund returns money that has already moved, this reduces what will be
 * asked for. Both need a reason and both are `money` scope, but they are
 * deliberately separate controls rather than one with a mode — an admin
 * looking at an unpaid session should not be offered a refund, and an admin
 * looking at a paid one should not be offered this.
 *
 * The reason is not optional and the field says why: a discount nobody can
 * explain a month later is indistinguishable from a mistake, and this is
 * the one number on the screen that a person chose rather than a rule
 * produced.
 */
export default function GoodwillDiscountForm({
  appointmentId,
  listPricePaise,
  existingDiscountPaise,
  existingReason,
}: {
  appointmentId: string;
  /** What the session costs before anything comes off. */
  listPricePaise: number;
  existingDiscountPaise: number;
  existingReason: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rupees, setRupees] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // A synchronous guard rather than the disabled attribute, the rule every
  // submit in this codebase follows: `disabled` lands a render too late to
  // stop the second of two fast taps.
  const submitting = useRef(false);

  const amountPaise = Math.round(Number(rupees) * 100);
  const valid =
    Number.isFinite(amountPaise) &&
    amountPaise > 0 &&
    amountPaise < listPricePaise &&
    reason.trim().length >= MIN_REASON_LENGTH;

  function submit() {
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/apply-goodwill-discount", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appointmentId, amountPaise, reason }),
        });
        if (res.ok) {
          setOpen(false);
          setRupees("");
          setReason("");
          router.refresh();
          return;
        }
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not apply that. Please try again.");
      } finally {
        submitting.current = false;
      }
    });
  }

  const inr = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;

  if (existingDiscountPaise > 0) {
    return (
      <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
        <p className="font-semibold">
          {inr(existingDiscountPaise)} off — they pay{" "}
          {inr(Math.max(100, listPricePaise - existingDiscountPaise))}
        </p>
        {existingReason && <p className="mt-0.5 text-amber-800">{existingReason}</p>}
        <p className="mt-1 text-amber-700">
          Applied before payment. To change it, cancel and rebook — a discount is not
          re-editable once the patient has been quoted it.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-semibold text-slate-500 transition hover:text-slate-800"
      >
        Take an amount off this session
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-[11px] text-slate-500">
        The session costs {inr(listPricePaise)}. This reduces what the patient is asked
        for — it does not refund anything, because nothing has been paid yet.
      </p>

      <div className="mt-2 flex items-end gap-2">
        <div>
          <label
            htmlFor={`goodwill-amount-${appointmentId}`}
            className="block text-[11px] font-semibold text-slate-700"
          >
            Take off (₹)
          </label>
          <input
            id={`goodwill-amount-${appointmentId}`}
            type="number"
            min={1}
            value={rupees}
            onChange={(e) => setRupees(e.target.value)}
            className="mt-1 w-24 rounded-lg border border-slate-300 p-2 text-xs"
          />
        </div>
        {Number.isFinite(amountPaise) && amountPaise > 0 && amountPaise < listPricePaise && (
          <p className="pb-2 text-[11px] font-semibold text-slate-700">
            They pay {inr(listPricePaise - amountPaise)}
          </p>
        )}
      </div>

      <label
        htmlFor={`goodwill-reason-${appointmentId}`}
        className="mt-2 block text-[11px] font-semibold text-slate-700"
      >
        Why?
      </label>
      <textarea
        id={`goodwill-reason-${appointmentId}`}
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. their first session was cut short by a connection problem"
        className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
      />

      {error && <p className="mt-1.5 text-[11px] font-semibold text-red-600">{error}</p>}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={isPending || !valid}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-slate-900 disabled:opacity-50"
        >
          {isPending ? "Applying…" : "Apply"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="text-[11px] font-semibold text-slate-500 hover:text-slate-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
