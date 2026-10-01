"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";

const MIN_REASON_LENGTH = 10;

/**
 * Declining a referral, with the reason it needs.
 *
 * This used to be one tap that moved a status word. The hospital that sent
 * the patient then read "Declined" and learned nothing -- not whether it was
 * the wrong specialty, outside the catchment, or a capacity problem that
 * would pass by Thursday -- so the clinic lost the one chance it had to say
 * what to send instead, and the same unsuitable referrals kept arriving.
 *
 * Deliberately an inline disclosure rather than a dialog: this sits in a
 * table row beside the referral it is about, one field is not worth a modal,
 * and the referral's own details stay on screen while the admin writes the
 * sentence that answers them. Two steps rather than an always-open textarea
 * because most rows on this screen are never declined.
 */
export default function DeclineReferralButton({
  referralId,
}: {
  referralId: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const router = useRouter();
  const toast = useToast();
  const fieldId = useId();

  const tooShort = reason.trim().length < MIN_REASON_LENGTH;

  async function handleDecline() {
    // A synchronous ref, because a `disabled` attribute lands a render too
    // late to stop a double tap.
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/decline-referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referralId, reason: reason.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not decline. Please try again.");
        // However this failed, the referral's real status may no longer be
        // what this page's snapshot showed -- an invite may have gone out
        // moments ago -- so refresh and stop offering a stale Decline.
        router.refresh();
        return;
      }
      toast.show("Referral declined. The hospital can read your reason.");
      setOpen(false);
      setReason("");
      router.refresh();
    } catch {
      setError("Could not reach the server. Nothing has been changed.");
    } finally {
      // Released for *this request*; the refresh above is carried by the
      // route progress bar rather than by holding this control busy.
      inFlight.current = false;
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold px-3 py-2 rounded-lg transition"
      >
        Decline
      </button>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-2 rounded-lg border border-red-200 bg-red-50/60 p-3">
      <label htmlFor={fieldId} className="block text-[11px] font-semibold text-slate-700">
        Why is this being declined?
      </label>
      <p className="text-[11px] text-slate-600">
        The hospital reads this. Say what to send instead - wrong specialty, outside
        the area, no capacity this week.
      </p>
      <textarea
        id={fieldId}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        className="w-full rounded-lg border border-slate-300 p-2 text-xs"
        placeholder="e.g. Neurological case - we only take orthopaedic referrals at present."
      />
      {error && <p className="text-[11px] text-red-700">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={handleDecline}
          // Its own validity gate and its own request -- never a wait
          // imposed by something else on the page.
          disabled={saving || tooShort}
          className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
        >
          {saving ? "Declining..." : "Decline referral"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={saving}
          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-white disabled:opacity-60"
        >
          Cancel
        </button>
        {tooShort && (
          <span className="text-[11px] text-slate-600">
            {MIN_REASON_LENGTH - reason.trim().length} more character
            {MIN_REASON_LENGTH - reason.trim().length === 1 ? "" : "s"}
          </span>
        )}
      </div>
    </div>
  );
}
