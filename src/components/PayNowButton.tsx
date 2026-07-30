"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
