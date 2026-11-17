"use client";

import { useState } from "react";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";

/** The patient's own switch for WhatsApp messages about their sessions. */
export default function WhatsAppConsentCard({ granted, readFailed, number }: { granted: boolean; readFailed: boolean; number: string | null }) {
  const router = useRouter();
  const { show } = useToast();
  const [on, setOn] = useState(granted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !on;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/patient/whatsapp-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ granted: next }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "That didn't save. Please try again.");
        return;
      }
      setOn(next);
      show(next ? "You'll get WhatsApp messages about your sessions." : "No more WhatsApp messages. Emails continue as before.");
      router.refresh();
    } catch {
      setError("That didn't save - check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="whatsapp-messages" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6" data-testid="whatsapp-consent">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display font-bold text-lg text-slate-800">WhatsApp messages</h2>
          <p className="mt-1 text-sm text-slate-600">
            Booking confirmations and reminders on WhatsApp{number ? ` to ${number}` : ""}, as well as by email. Never anything about your health.
            Turn it off here any time, or reply STOP to any message.
          </p>
          {!number && <p className="mt-1 text-sm text-amber-900">Add your mobile number above first.</p>}
          {readFailed && <p className="mt-1 text-sm text-amber-900">We couldn&apos;t check your choice just now, so it shows as off. Refresh to try again.</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Send me WhatsApp messages about my sessions"
          disabled={busy || readFailed || (!on && !number)}
          onClick={() => void toggle()}
          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-60"
        >
          <span className={`relative inline-block h-6 w-11 rounded-full transition ${on ? "bg-teal-700" : "bg-slate-300"}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
          </span>
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
