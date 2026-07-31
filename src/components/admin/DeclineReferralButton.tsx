"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeclineReferralButton({
  referralId,
}: {
  referralId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleDecline() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/decline-referral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referralId }),
    });
    setLoading(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not decline. Please try again.");
      // Either way this fails, it means the referral's real status is no
      // longer what this page's snapshot showed (an invite went out,
      // possibly moments ago) — refresh so the stale "Decline" option
      // stops being offered.
      router.refresh();
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleDecline}
        disabled={loading}
        className="bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-700 text-xs font-semibold px-3 py-2 rounded-lg transition"
      >
        {loading ? "Declining..." : "Decline"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
