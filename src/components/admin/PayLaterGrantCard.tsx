"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";
import { formatClinicDate } from "@/lib/formatDateTime";

// Letting one patient be treated first and settle afterwards.
//
// It sits on the patient's own profile because that is where the decision is
// made -- you are looking at the person when you make it -- but it is gated
// on `scopeCanManage(scope, "money")` by its caller, matching the route:
// extending credit is a money capability, and every desk that manages People
// can already edit a phone number.
//
// The card states the arrangement in full rather than assuming it is known.
// This is the one control in the app with no ceiling behind it: a patient on
// terms can owe any amount, the therapist is paid whether or not they settle,
// and nothing in the system will stop it. Somebody granting this for the
// first time should be able to read what they are agreeing to without
// leaving the screen.
export default function PayLaterGrantCard({
  patientId,
  patientName,
  enabled,
  reason,
  grantedAt,
  featureEnabled,
  referredByHospital,
}: {
  patientId: string;
  patientName: string | null;
  enabled: boolean;
  reason: string | null;
  grantedAt: string | null;
  /** The clinic-wide switch. Off, a grant would do nothing. */
  featureEnabled: boolean;
  /** A partner's commission is taken on revenue recognised at completion, so
   *  terms would have the clinic paying a share of money it has not been
   *  given. The route refuses it; this is the sentence saying why. */
  referredByHospital: boolean;
}) {
  const [draftReason, setDraftReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const busy = useRef(false);
  const fieldId = useId();
  const router = useRouter();
  const { show } = useToast();

  async function submit(next: boolean) {
    // A synchronous ref, because a `disabled` attribute lands a render too
    // late to stop the second tap of a double-click.
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      const res = await fetch("/api/admin/set-patient-pay-later", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          enabled: next,
          ...(next ? { reason: draftReason } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? "Could not save. Please try again.");
        return;
      }
      show(
        next
          ? `${patientName ?? "This patient"} can pay after their treatment.`
          : `${patientName ?? "This patient"} pays before their sessions again. Anything already owed is still owed.`
      );
      setDraftReason("");
      // The control is busy for its own request and releases here; the
      // refresh is handed to the progress bar above the chrome.
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      busy.current = false;
    }
  }

  const reasonLongEnough = draftReason.trim().length >= 10;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">Pay later</h3>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            enabled ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-600"
          }`}
        >
          {enabled ? "On for this patient" : "Off"}
        </span>
      </div>

      <p className="mt-2 text-xs text-slate-600">
        A patient on pay later books without paying, and owes nothing until a session has
        actually been delivered. On completion the price appears in what they owe, in the
        clinic&apos;s revenue, and in the therapist&apos;s share - the therapist is paid for
        the work whether or not the patient has settled, so the clinic carries the gap.
        There is no limit on what they may owe.
      </p>

      {/* Said here because here is where the decision is made, and the admin
          is usually typing "patient of six years" into the box below while
          the app has no record of them before this account. Their first
          session therefore gets whatever a new patient would be offered --
          once, and once only: a booking on terms makes them no longer new
          from then on, exactly as a paid one does. */}
      <p className="mt-2 text-xs text-slate-600">
        Discounts work as they do for anyone else. If this account is new here, their
        first session gets whatever a new patient is offered - once, not on every
        booking.
      </p>

      {enabled && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          {reason && (
            <p className="text-xs text-slate-700">
              <span className="font-semibold text-slate-900">Why:</span> {reason}
            </p>
          )}
          {grantedAt && (
            <p className="mt-0.5 text-[11px] text-slate-500">
              Since {formatClinicDate(grantedAt)}
            </p>
          )}
        </div>
      )}

      {referredByHospital ? (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          This patient was referred by a partner hospital, and that partner earns a share
          of the revenue as soon as a session is delivered. Pay later would have the clinic
          paying that share out of money it has not been given yet, so it is not offered
          here.
        </p>
      ) : enabled ? (
        <div className="mt-4">
          <button
            onClick={() => startTransition(() => submit(false))}
            disabled={isPending}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            Stop pay later
          </button>
          <p className="mt-1.5 text-[11px] text-slate-500">
            Stops new bookings on terms. Sessions already booked keep them, and anything
            already owed stays owed and can still be settled.
          </p>
        </div>
      ) : (
        <div className="mt-4">
          {!featureEnabled && (
            <p className="mb-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
              Pay later is switched off for the whole clinic, so this would do nothing yet.
              Turn it on under Money &rarr; Owed by Patients first.
            </p>
          )}
          <label htmlFor={fieldId} className="block text-xs font-semibold text-slate-800">
            Why this patient may pay later
          </label>
          <p className="mt-0.5 text-[11px] text-slate-500">
            At least 10 characters. It is the only record of why the clinic took this on.
          </p>
          <textarea
            id={fieldId}
            rows={2}
            value={draftReason}
            onChange={(e) => setDraftReason(e.target.value)}
            placeholder="Patient of six years, settles monthly by bank transfer"
            className="mt-1.5 w-full rounded-lg border border-slate-300 p-2 text-xs"
          />
          <button
            onClick={() => startTransition(() => submit(true))}
            disabled={isPending || !reasonLongEnough || !featureEnabled}
            className="mt-2 rounded-lg bg-slate-800 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60"
          >
            Allow this patient to pay later
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
