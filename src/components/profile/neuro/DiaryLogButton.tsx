"use client";

import { useState } from "react";
import DiaryLogDialog from "@/components/profile/neuro/DiaryLogDialog";
import { offeredDiaryKinds } from "@/lib/patientDiaryForm";
import type { ProfileKind } from "@/lib/outcomeMeasures";

/**
 * "Log a fall" (or the record's own diary kinds), high on the patient's
 * Health Profile (B2) rather than inside the diary card: writing a fall down
 * should never need a scroll. The kinds are the server's (offeredDiaryKinds);
 * the route refuses the rest.
 */
export default function DiaryLogButton({ profileKind }: { profileKind: ProfileKind }) {
  const [open, setOpen] = useState(false);
  const kinds = offeredDiaryKinds(profileKind);
  if (kinds.length === 0) return null;
  const label = kinds.includes("fall") ? "Log a fall or a near miss" : kinds.includes("active_minutes") ? "Log your active minutes" : "Write in your diary";
  return (
    <div className="print:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="diary-log-button"
        className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 px-5 text-base font-semibold text-white shadow-sm hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 sm:w-auto"
      >
        <i aria-hidden className="fa-solid fa-pen text-sm" />
        {label}
      </button>
      {open && <DiaryLogDialog profileKind={profileKind} initialKind={kinds.includes("fall") ? "fall" : undefined} onClose={() => setOpen(false)} />}
    </div>
  );
}
