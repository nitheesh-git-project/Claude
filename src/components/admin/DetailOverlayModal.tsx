"use client";

import { useRouter } from "@/lib/useRouter";
import type { ReactNode } from "react";

// Wraps a person-detail page's content when it's reached via in-portal soft
// navigation (see the @modal intercepting routes under
// app/admin/dashboard/@modal) so clicking a patient/therapist name from
// anywhere in the dashboard overlays their profile instead of navigating
// away -- Bug 10. Closing goes back to whatever tab/state the admin was on,
// via router.back(), same as SessionDetailDrawer's onClose pattern but
// router-driven since this is a real route, not local component state.
export default function DetailOverlayModal({ children }: { children: ReactNode }) {
  const router = useRouter();

  function close() {
    router.back();
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-50 rounded-2xl shadow-xl max-w-4xl w-full my-8 p-6 text-xs relative"
      >
        <button
          onClick={close}
          aria-label="Close"
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 text-2xl leading-none z-10"
        >
          &times;
        </button>
        {children}
      </div>
    </div>
  );
}
