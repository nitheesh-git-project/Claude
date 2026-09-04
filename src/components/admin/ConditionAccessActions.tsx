"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";

export default function ConditionAccessActions({
  grantId,
  status,
}: {
  grantId: string;
  status: "requested" | "approved";
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function decide(action: "approve" | "decline" | "revoke") {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/condition-access/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantId, action }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {status === "requested" ? (
          <>
            <button
              onClick={() => decide("decline")}
              disabled={isPending}
              className="bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-700 text-xs font-semibold px-3 py-2 rounded-lg transition"
            >
              Decline
            </button>
            <button
              onClick={() => decide("approve")}
              disabled={isPending}
              className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-3 py-2 rounded-lg transition"
            >
              {isPending ? "Approving..." : "Approve"}
            </button>
          </>
        ) : (
          <button
            onClick={() => decide("revoke")}
            disabled={isPending}
            className="bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-700 text-xs font-semibold px-3 py-2 rounded-lg transition"
          >
            {isPending ? "Revoking..." : "Revoke access"}
          </button>
        )}
      </div>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
