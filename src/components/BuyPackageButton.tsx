"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { payForPackage } from "@/lib/packagePayment";

export default function BuyPackageButton({
  packageId,
  name,
  email,
  description,
  priceInPaise,
}: {
  packageId: string;
  name: string;
  email: string;
  description: string;
  priceInPaise: number;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleBuy() {
    setError(null);
    setLoading(true);
    await payForPackage({
      packageId,
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
        onClick={handleBuy}
        disabled={loading}
        className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
      >
        {loading
          ? "Please wait..."
          : `Buy for ₹${(priceInPaise / 100).toLocaleString("en-IN")}`}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
