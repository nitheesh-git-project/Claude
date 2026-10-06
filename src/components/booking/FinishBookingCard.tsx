"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/lib/useRouter";
import { payForAppointment, preloadRazorpayScript } from "@/lib/razorpay";
import type { PaymentTryAnswer, PaymentTryOutcome } from "@/lib/paymentTries";

export type FinishBookingDraft = {
  appointmentId: string;
  /** Already formatted in the clinic's zone by the server. */
  whenLabel: string;
  concern: string;
};

// What a locked booking account sees on sign-in instead of "Approval
// Pending": the booking it left unpaid, and the two ways forward. Paying here
// unlocks the account exactly as paying in the wizard would (the verify
// route); a try that does not end in a payment is counted like any other
// (/api/patient/payment-try), so the dashboard opens on the same limit.
export default function FinishBookingCard({
  draft,
  name,
  email,
  keptUntilLabel,
  bookHref,
}: {
  draft: FinishBookingDraft | null;
  name: string;
  email: string;
  /** When the account is deleted if nothing changes, formatted by the server. */
  keptUntilLabel: string | null;
  bookHref: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (draft) preloadRazorpayScript();
  }, [draft]);

  async function noteFailedTry(outcome: PaymentTryOutcome) {
    try {
      const res = await fetch("/api/patient/payment-try", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flow: "online", outcome, appointmentId: draft?.appointmentId }),
      });
      if (!res.ok) return;
      const answer = (await res.json()) as PaymentTryAnswer;
      if (answer.unlocked) setUnlocked(true);
    } catch {
      // The account stays as it was; the next try reports.
    }
  }

  async function handlePay() {
    if (!draft || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const release = () => {
      busyRef.current = false;
      setBusy(false);
    };
    await payForAppointment({
      appointmentId: draft.appointmentId,
      name,
      email,
      description: draft.concern,
      onSuccess: () => {
        release();
        router.push("/patient/dashboard");
      },
      onFree: async () => {
        const res = await fetch("/api/appointments/confirm-free", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appointmentId: draft.appointmentId }),
        }).catch(() => null);
        release();
        if (res?.ok) router.push("/patient/dashboard");
        else setError("Could not confirm your booking. Please try again.");
      },
      onError: (message) => {
        release();
        setError(message);
        void noteFailedTry("failed");
      },
      onDismiss: () => {
        release();
        setError("Payment was not completed. You can try again.");
        void noteFailedTry("dismissed");
      },
    });
  }

  return (
    <section className="py-16 max-w-lg mx-auto px-4">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg text-center">
        <div className="w-16 h-16 bg-teal-50 text-teal-700 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
          <i className="fa-solid fa-calendar-check" aria-hidden="true"></i>
        </div>
        <h1 className="text-xl font-bold text-slate-900">Finish your booking</h1>
        {draft ? (
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            Your <span className="font-semibold text-slate-800">{draft.concern}</span> session on{" "}
            <span className="font-semibold text-slate-800">{draft.whenLabel}</span>{" "}
            is waiting for payment. Your account opens as soon as it&apos;s paid.
          </p>
        ) : (
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            Your account opens once your first booking is paid. Pick a time to get started.
          </p>
        )}

        {error && (
          <p role="alert" className="text-xs text-red-600 mt-4">
            {error}
          </p>
        )}

        {unlocked ? (
          <div role="status" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 space-y-2">
            <p className="font-semibold">Your account is ready.</p>
            <p>Your booking is saved as unpaid - finish paying from your dashboard.</p>
            <Link href="/patient/dashboard" className="inline-block font-bold text-teal-700 hover:underline">
              Go to Dashboard →
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {draft && (
              <button
                type="button"
                onClick={handlePay}
                disabled={busy}
                className="w-full bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-bold py-3 px-4 rounded-xl text-sm transition shadow"
              >
                {busy ? "Please wait..." : "Pay now"}
              </button>
            )}
            <Link
              href={bookHref}
              className={`block w-full font-bold py-3 px-4 rounded-xl text-sm transition ${
                draft
                  ? "bg-slate-100 hover:bg-slate-200 text-slate-800"
                  : "bg-teal-700 hover:bg-teal-800 text-white shadow"
              }`}
            >
              {draft ? "Pick another time" : "Book a session"}
            </Link>
          </div>
        )}

        {keptUntilLabel && !unlocked && (
          <p className="text-[11px] text-slate-500 mt-5 leading-relaxed">
            If it isn&apos;t paid, this account and its booking are removed after {keptUntilLabel}.
          </p>
        )}
      </div>
    </section>
  );
}
