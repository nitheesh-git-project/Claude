"use client";

import { useState } from "react";
import { useRouter } from "@/lib/useRouter";
import { payForAppointment } from "@/lib/razorpay";

export default function PayNowButton({
  appointmentId,
  name,
  email,
  description,
  amountPaise,
}: {
  appointmentId: string;
  name: string;
  email: string;
  description: string;
  amountPaise: number;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handlePay() {
    setError(null);
    setLoading(true);
    await payForAppointment({
      appointmentId,
      name,
      email,
      description,
      onSuccess: () => {
        setLoading(false);
        router.refresh();
      },
      onError: (message) => {
        setLoading(false);
        setError(message);
      },
      onDismiss: () => {
        setLoading(false);
      },
      // A discount has taken this booking to nothing since it was created --
      // an admin's goodwill adjustment, or an invite reward that landed.
      // Razorpay refuses a zero-amount order, so it is confirmed without one
      // rather than failing with a message the patient cannot act on.
      onFree: async () => {
        try {
          const res = await fetch("/api/appointments/confirm-free", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appointmentId }),
          });
          const data = await res.json().catch(() => ({}));
          setLoading(false);
          if (!res.ok) {
            setError(data.error ?? "Could not confirm the booking. Please try again.");
            return;
          }
          router.refresh();
        } catch {
          setLoading(false);
          setError("Could not reach the server. Please try again.");
        }
      },
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handlePay}
        disabled={loading}
        className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
      >
        {loading
          ? "Please wait..."
          : `Pay ₹${(amountPaise / 100).toLocaleString("en-IN")} Now`}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
