"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/lib/useConfirm";

export default function WithdrawReferralButton({
  referralId,
}: {
  referralId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function handleWithdraw() {
    if (!(await confirm("Withdraw this referral? The clinic will no longer act on it."))) {
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/hospital/withdraw-referral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referralId }),
    });
    setLoading(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not withdraw. Please try again.");
      // A stale status snapshot (e.g. an invite went out moments ago) is the
      // most likely cause of a failure here -- refresh so this option stops
      // being offered once that's no longer true.
      router.refresh();
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleWithdraw}
        disabled={loading}
        className="text-red-600 hover:text-red-800 disabled:opacity-60 font-semibold"
      >
        {loading ? "Withdrawing..." : "Withdraw"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      {dialog}
    </div>
  );
}
