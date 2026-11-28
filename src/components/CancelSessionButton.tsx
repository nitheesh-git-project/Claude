"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { useToast } from "@/lib/toast";
import { useRouter } from "@/lib/useRouter";
import { CANCELLATION_FULL_REFUND_HOURS } from "@/lib/pricing";
import { usePrompt } from "@/lib/usePrompt";
import { patientRefundDelayedNotice } from "@/lib/refundState";
import { debugNow, debugNowHeaders } from "@/lib/debugNow";
import { msUntilCancelCloses, patientCancelClosed } from "@/lib/patientCancelCutoff";
import { patientCancelMessage } from "@/lib/cancelOutcome";

export default function CancelSessionButton({
  appointmentId,
  paid,
  slotTime,
  refundWindowHours = CANCELLATION_FULL_REFUND_HOURS,
  cutoffMinutes = null,
  serverNowMs = null,
  payLater = false,
  viaProgramme = false,
  refundablePaise = 0,
  noTherapistInTime = false,
  label = "Cancel Session",
}: {
  /** Nobody was confirmed in time (sessionPatientActions.ts): no refund
   *  window applies, so the dialog promises the full refund the route gives. */
  noTherapistInTime?: boolean;
  label?: string;
  appointmentId: string;
  paid: boolean;
  slotTime: string | null;
  // Home visits use their own, admin-configurable window
  // (home_visit_cancellation_refund_hours) instead of the fixed online one
  // -- passed in by the caller so this dialog's "will this be refunded?"
  // warning agrees with what the server will actually decide, rather than
  // hardcoding the online number for every session.
  refundWindowHours?: number;
  /** Online sessions only: the clinic's cut-off
   *  (`patient_cancel_cutoff_minutes`). Inside it the button is gone -- the
   *  route refuses too. Null means no cut-off (home visits). */
  cutoffMinutes?: number | null;
  /** The page's request-time clock, for a first render that matches the HTML. */
  serverNowMs?: number | null;
  /** On pay-later terms: nothing is owed for a session cancelled before it. */
  payLater?: boolean;
  /** Drawn from a programme: the session goes back to it, or is used up. */
  viaProgramme?: boolean;
  /** What would go back on a paid session: paid less anything refunded. */
  refundablePaise?: number;
}) {
  // Hidden from the first render once inside the cut-off, and hidden at the
  // moment it closes for a page left open -- one timer, no polling. Judged on
  // the debug bar's clock, which the route honours while the bar is on.
  // The first render uses the server's request clock (`serverNowMs`) so the
  // HTML and the hydrated tree agree; the effect then re-reads the browser's.
  const [closed, setClosed] = useState(() =>
    cutoffMinutes === null || serverNowMs === null
      ? false
      : patientCancelClosed({ slotTime, nowMs: serverNowMs, cutoffMinutes })
  );
  useEffect(() => {
    if (cutoffMinutes === null || closed) return;
    const wait = msUntilCancelCloses({ slotTime, nowMs: debugNow(), cutoffMinutes });
    if (wait === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setClosed(true);
      return;
    }
    // setTimeout caps at ~24.8 days; anything further re-checks on the next render.
    if (wait > 2_000_000_000) return;
    const t = setTimeout(() => setClosed(true), wait);
    return () => clearTimeout(t);
  }, [slotTime, cutoffMinutes, closed]);

  // The parent only renders this button for requested/confirmed sessions,
  // so a real success unmounts it via router.refresh() before this
  // optimistic overlay would need to clear on its own -- a failure just
  // reverts to the base `false`. See PatientActiveToggle's comment.
  const [optimisticCancelled, setOptimisticCancelled] = useOptimistic(false);
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { prompt, dialog } = usePrompt();

  async function handleCancel() {
    // What happens to the money, in every case, by the same branches the
    // route takes (cancelOutcome.ts) -- judged on the debug bar's clock, which
    // the route honours while the bar is on.
    const reason = await prompt(
      patientCancelMessage({
        slotTime,
        nowMs: debugNow(),
        windowHours: noTherapistInTime ? Number.NEGATIVE_INFINITY : refundWindowHours,
        paidDirect: paid && !viaProgramme,
        viaProgramme,
        cashCollected: false,
        cashCollectedPaise: null,
        refundablePaise: Math.max(0, refundablePaise),
        payLater,
      })
    );
    if (reason === null) return; // dismissed the prompt
    setError(null);
    startTransition(async () => {
      setOptimisticCancelled(true);
      const res = await fetch("/api/appointments/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...debugNowHeaders() },
        body: JSON.stringify({ appointmentId, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not cancel. Please try again.");
        if (res.status === 409) {
          // Someone else (another tab, or an admin) already cancelled this
          // session - refresh so the page reflects that instead of still
          // showing it as active.
          router.refresh();
        }
        return;
      }
      // A toast, not an error line: the refresh below unmounts this button,
      // which used to take the failure message with it and leave only the
      // success toast saying the refund was on its way.
      if (data.refundFailed) {
        show(patientRefundDelayedNotice(data.refundPaise), "info");
      } else {
        show(paid ? "Session cancelled. Any refund due is on its way." : "Session cancelled. Nothing was charged.");
      }
      router.refresh();
    });
  }

  if (optimisticCancelled && !error) {
    return <span className="text-sm font-semibold text-slate-600">Cancelling...</span>;
  }

  if (closed) return null;

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleCancel}
        disabled={isPending}
        className="min-h-11 px-1 text-red-700 hover:underline text-sm font-semibold disabled:opacity-60"
      >
        {label}
      </button>
      {error && <span className="text-sm text-red-700">{error}</span>}
      {dialog}
    </div>
  );
}
