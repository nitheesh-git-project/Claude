"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";

/**
 * Whether this therapist is on the public /team page.
 *
 * The public view needs three things at once -- `approved`, `active` and
 * `visible_on_team` -- so this switch is only the deciding one while the
 * other two hold. A suspended or still-unapproved therapist is already off
 * the page, and a live "Hide from /team page" button beside them offers an
 * admin an action that would change nothing they can see. It is disabled and
 * says which of the two is the reason, because a greyed-out control with no
 * explanation is the shape this codebase keeps correcting.
 *
 * The setting underneath is left exactly as it is. It comes back into force
 * the moment the account does, which is what makes reactivating restore the
 * therapist to whatever the admin had chosen rather than to a default.
 */
export default function TherapistTeamVisibilityToggle({
  therapistId,
  visibleOnTeam,
  active,
  approved,
}: {
  therapistId: string;
  visibleOnTeam: boolean;
  active: boolean;
  approved: boolean;
}) {
  const blockedBy = !active ? "suspended" : !approved ? "unapproved" : null;
  // See PatientActiveToggle's identical comment -- flips the label the
  // instant it's clicked instead of waiting on the fetch + router.refresh()
  // round trip.
  const [optimisticVisible, setOptimisticVisible] = useOptimistic(visibleOnTeam);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleToggle() {
    if (blockedBy) return;
    const next = !optimisticVisible;
    setError(null);
    startTransition(async () => {
      setOptimisticVisible(next);
      const res = await fetch("/api/admin/set-therapist-team-visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ therapistId, visibleOnTeam: next }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not update. Please try again.");
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleToggle}
        disabled={isPending || blockedBy !== null}
        // The label still names what the setting *is*, so an admin can see
        // what will come back when the account does.
        title={
          blockedBy === "suspended"
            ? "Suspended therapists are already off the /team page."
            : blockedBy === "unapproved"
              ? "Therapists appear on /team once they are approved."
              : undefined
        }
        className={`rounded-lg px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
          blockedBy
            ? "bg-slate-100 text-slate-400"
            : optimisticVisible
              ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
              : "bg-teal-700 text-white hover:bg-teal-800"
        }`}
      >
        {optimisticVisible ? "Hide from /team page" : "Show on /team page"}
      </button>
      {blockedBy && (
        <span className="max-w-[15rem] text-[11px] leading-snug text-slate-500">
          {blockedBy === "suspended"
            ? "Already off /team while suspended. This comes back as you left it when you restore them."
            : "Appears on /team once approved, if this is set to show."}
        </span>
      )}
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
