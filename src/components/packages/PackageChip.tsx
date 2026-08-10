"use client";

import { useState } from "react";
import PackageDetailModal from "@/components/packages/PackageDetailModal";

// Small tappable chip dropped into any session card for a package-covered
// appointment -- patient dashboard, therapist dashboard, and (eventually)
// admin's own card renderers all funnel through the same
// /api/packages/purchase-detail-backed modal, so "what's the story on this
// package" always opens the same view regardless of where it was tapped.
export default function PackageChip({
  purchaseId,
  label,
}: {
  purchaseId: string;
  label?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:underline"
      >
        <i className="fa-solid fa-layer-group" aria-hidden="true" />
        {label ? `Package ${label}` : "Paid via package"}
      </button>
      {open && <PackageDetailModal purchaseId={purchaseId} onClose={() => setOpen(false)} />}
    </>
  );
}
