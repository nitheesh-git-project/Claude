"use client";

import { useState } from "react";
import { useRouter } from "@/lib/useRouter";
import type { ReactNode } from "react";

// Wraps a person-detail page's content when it's reached via in-portal soft
// navigation (see the @modal intercepting routes under
// app/admin/dashboard/@modal) so clicking a patient/therapist name from
// anywhere in the dashboard overlays their profile instead of navigating
// away -- Bug 10. Closing goes back to whatever tab/state the admin was on,
// via router.back(), same as SessionDetailDrawer's onClose pattern but
// router-driven since this is a real route, not local component state.
export default function DetailOverlayModal({
  children,
  closeHref,
}: {
  children: ReactNode;
  /** Where closing goes when there is no history to go back to.
   *
   *  The overlay is reached two ways. Tapped from inside the dashboard it is
   *  an intercepted route, so `router.back()` returns to the exact screen,
   *  filters and scroll position the admin left -- which no href can
   *  reproduce. Reached directly (a reload, a new tab, a shared link) the
   *  browser history holds nothing of ours, and `back()` would take them off
   *  the site entirely, so the caller names the screen this detail belongs
   *  to instead. */
  closeHref?: string;
}) {
  const router = useRouter();
  const [closed, setClosed] = useState(false);

  function close() {
    if (closeHref) {
      // The dashboard behind this overlay is **already rendered**, at the
      // very screen this detail belongs to -- so closing is a change of URL
      // and nothing else. `router.push` would re-run the dashboard's ~49
      // queries to paint what the admin is already looking at, and they
      // would watch a skeleton to get there. The History API instead, which
      // is the same rule AdminShell's own tab state follows and for the same
      // reason. It is `replaceState`, not `pushState`: a direct load has no
      // entry of ours behind it, so adding one would make Back reopen the
      // overlay they just shut.
      window.history.replaceState(null, "", closeHref);
      setClosed(true);
      return;
    }
    // Tapped from inside the dashboard: this is an intercepted route, so
    // going back returns to the exact screen, filters and scroll position
    // they left -- which no href can reproduce.
    router.back();
  }

  if (closed) return null;

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
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-700 text-2xl leading-none z-10"
        >
          &times;
        </button>
        {children}
      </div>
    </div>
  );
}
