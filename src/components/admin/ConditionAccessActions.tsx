"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useConfirm } from "@/lib/useConfirm";
import { useToast } from "@/lib/toast";

/**
 * Decide a therapist's access to a patient's Health Profile.
 *
 * Granting and removing both change who can work on a patient's record, so
 * both ask first, in the names of the two people involved, and say what
 * follows. The toast afterwards names them too: the row refreshes away.
 */
export default function ConditionAccessActions({
  grantId,
  status,
  therapistName = "this therapist",
  patientName = "this patient",
}: {
  grantId: string;
  status: "requested" | "approved";
  therapistName?: string;
  patientName?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const { show } = useToast();

  async function decide(action: "approve" | "decline" | "revoke") {
    setError(null);
    if (action === "approve") {
      const ok = await confirm(
        `Let ${therapistName} edit ${patientName}'s Health Profile? They can add to it straight away. Any other therapist who can edit it now loses that.`,
        { confirmLabel: "Give access", cancelLabel: "Not yet" }
      );
      if (!ok) return;
    }
    if (action === "revoke") {
      const ok = await confirm(
        `Remove ${therapistName}'s access to ${patientName}'s Health Profile? They stop seeing it immediately; their notes stay.`,
        { confirmLabel: "Remove access", cancelLabel: "Keep access" }
      );
      if (!ok) return;
    }
    startTransition(async () => {
      const res = await fetch("/api/admin/condition-access/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantId, action }),
      }).catch(() => null);
      if (res?.ok) {
        show(
          action === "approve"
            ? `${therapistName} can now edit ${patientName}'s Health Profile`
            : action === "revoke"
              ? `${therapistName}'s access to ${patientName}'s Health Profile was removed`
              : `Declined ${therapistName}'s request to edit ${patientName}'s Health Profile`
        );
        router.refresh();
      } else {
        const data = (await res?.json().catch(() => ({}))) ?? {};
        setError(data.error ?? "Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {dialog}
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
            {isPending ? "Removing..." : "Remove access"}
          </button>
        )}
      </div>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
