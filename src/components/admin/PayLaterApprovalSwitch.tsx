"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useSaveSetting } from "@/lib/useSaveSetting";

/**
 * Whether every pay-later booking waits for an admin's approval
 * (`site_settings.pay_later_approval_required`, on by default -- the owner's
 * decision). Beside the master switch and the ceiling on Money -> Patients
 * owe, the screen whose figures it governs.
 *
 * Off, a pay-later booking confirms the way a paid one does: auto-assigned
 * when the roster has one answer, otherwise confirmed when an admin assigns.
 * Turning it off approves nothing already waiting -- those stay in the queue
 * on Home until somebody decides them.
 */
export default function PayLaterApprovalSwitch({ required }: { required: boolean }) {
  const saveSetting = useSaveSetting();
  const [optimistic, setOptimistic] = useOptimistic(required);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleToggle() {
    const next = !optimistic;
    setError(null);
    startTransition(async () => {
      setOptimistic(next);
      try {
        await saveSetting("pay_later_approval_required", next);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="flex items-start justify-between gap-4 border-t border-slate-100 pt-4">
      <div>
        <p className="text-xs font-semibold text-slate-800">Approve each pay-later booking</p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {optimistic
            ? "Every pay-later booking waits on Home under “Pay-later bookings to approve” until an admin approves or declines it."
            : "Pay-later bookings confirm like paid ones, with no approval step. Anything already waiting still needs a decision."}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-[11px] text-red-600">
            {error}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${
          optimistic ? "bg-teal-600" : "bg-slate-300"
        }`}
        aria-pressed={optimistic}
        aria-label="Approve each pay-later booking"
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
            optimistic ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
