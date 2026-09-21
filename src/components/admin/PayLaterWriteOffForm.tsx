"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";
import { useConfirm } from "@/lib/useConfirm";
import Spinner from "@/components/system/Spinner";
import { WRITE_OFF_REASON_MIN_CHARS } from "@/lib/payLaterWriteOff";

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

// Deciding not to chase one session's money, and taking that back.
//
// It sits on the owed session's own row on Money → Owed by Patients rather
// than in the session drawer, because this is the screen an admin is looking
// at when they make the decision -- the same reasoning that puts the ageing
// setting beside the figure it colours. A refund lives in the drawer; a debt
// is forgiven where the debt is read.
//
// Three things it has to say, and the wording of each is the point:
//
//   1. **It is a cost, not a discount.** The clinic earned this and did not
//      collect it, so revenue and the therapist's pay do not move. An admin
//      who thinks they are reducing a figure will come back asking why the
//      figure did not move.
//   2. **A reason is required both ways.** Writing off gives money away;
//      bringing it back tells a patient a forgiven debt is owed again.
//   3. **It can be undone.** A one-way door on a hand-typed amount is what
//      this codebase avoids everywhere else, and saying so at the button is
//      what stops the control feeling more dangerous than it is.
export default function PayLaterWriteOffForm({
  appointmentId,
  amountPaise,
  writtenOff,
}: {
  appointmentId: string;
  amountPaise: number;
  /** Already forgiven: the control offers the reversal instead. */
  writtenOff: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const busy = useRef(false);
  const reasonId = useId();
  const router = useRouter();
  const { show } = useToast();
  const { confirm, dialog } = useConfirm();

  async function submit() {
    // A synchronous ref: a `disabled` attribute lands a render too late, and
    // two taps here are two answers to one decision.
    if (busy.current) return;
    setError(null);
    if (reason.trim().length < WRITE_OFF_REASON_MIN_CHARS) {
      setError(
        `Say why, in at least ${WRITE_OFF_REASON_MIN_CHARS} characters. It is the only record of this decision.`
      );
      return;
    }
    const ok = await confirm(
      writtenOff
        ? `Ask this patient for ${formatInr(amountPaise)} again? The cost recorded for it is removed at the same time.`
        : `Stop chasing ${formatInr(amountPaise)}? It is recorded as a cost on Money → Costs. Revenue and the therapist's pay do not change, and this can be undone.`
    );
    if (!ok) return;

    busy.current = true;
    try {
      const res = await fetch("/api/admin/write-off-pay-later-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId,
          writtenOff: !writtenOff,
          reason: reason.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Could not save. Please try again.");
        return;
      }
      show(
        writtenOff
          ? `${formatInr(amountPaise)} is owed again, and the cost recorded for it is gone.`
          : `${formatInr(amountPaise)} written off and recorded as a cost.`
      );
      setOpen(false);
      setReason("");
      // Busy for its own request; the refresh is handed to the progress bar.
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      busy.current = false;
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 hover:underline"
      >
        {writtenOff ? "Ask for it again" : "Write it off"}
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-semibold text-slate-900">
        {writtenOff
          ? `Bring ${formatInr(amountPaise)} back as owed`
          : `Stop chasing ${formatInr(amountPaise)}`}
      </p>
      <p className="mt-0.5 text-[11px] text-slate-500">
        {writtenOff
          ? "The patient owes this again and it returns to the totals above. The cost recorded for it is removed."
          : "Recorded as a cost on Money → Costs. The clinic earned this session and did not collect it, so revenue and the therapist's pay stay exactly as they are."}
      </p>
      <label htmlFor={reasonId} className="mt-2 block text-[11px] font-semibold text-slate-800">
        Why
      </label>
      <textarea
        id={reasonId}
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={
          writtenOff
            ? "They have been back in touch and want to settle"
            : "Moved away last year and has not been reachable since"
        }
        className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
      />
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={() => startTransition(submit)}
          disabled={isPending || reason.trim().length < WRITE_OFF_REASON_MIN_CHARS}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60"
        >
          {isPending && <Spinner />}
          {writtenOff ? "Ask for it again" : "Write it off"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setReason("");
            setError(null);
          }}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
      {dialog}
    </div>
  );
}
