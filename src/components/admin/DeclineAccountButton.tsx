"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import DeclineApplicationDialog from "@/components/admin/DeclineApplicationDialog";

export default function DeclineAccountButton({
  userId,
  role,
  name,
}: {
  userId: string;
  role: "therapist" | "patient";
  name: string;
}) {
  // The parent only renders this button for pending signups, so a real
  // success unmounts it via router.refresh() before this optimistic overlay
  // would need to clear on its own. See PatientActiveToggle's comment.
  const [optimisticDeclined, setOptimisticDeclined] = useOptimistic(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  if (optimisticDeclined) {
    return <span className="text-xs font-semibold text-slate-500">Declined</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold px-4 py-2 rounded-xl transition"
      >
        Decline
      </button>
      {dialogOpen && (
        <DeclineApplicationDialog
          kind={role}
          name={name}
          endpoint="/api/admin/decline-account"
          body={{ userId }}
          onClose={() => setDialogOpen(false)}
          onDeclined={() => {
            setDialogOpen(false);
            startTransition(() => {
              setOptimisticDeclined(true);
              router.refresh();
            });
          }}
        />
      )}
    </>
  );
}
