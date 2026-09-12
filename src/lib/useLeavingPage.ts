"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePendingWork } from "@/lib/pendingWork";

/**
 * Feedback for a navigation the browser performs, not React.
 *
 * The patient, therapist and hospital dashboards move between sections with
 * plain anchors rather than `next/link` -- a deliberate choice documented in
 * `DashboardShell`, because client-side transitions into a differently-
 * chromed route were silently not completing. The cost of it is that nothing
 * in React ever learns a navigation started: `useRouter` is not involved,
 * `useLinkStatus` is not involved, and the person sits on the old screen
 * with no acknowledgement at all until the new document paints. That is the
 * dead-click failure the teal bar was built to remove, and it was still
 * happening on three of the four dashboards.
 *
 * The old document stays on screen until the new one is ready, so a bar
 * drawn on click is visible for exactly the wait. Two details matter:
 *
 * - **It is never released on this page.** The document is about to be torn
 *   down and the bar goes with it. Releasing on a timer would clear the
 *   signal while the person was still waiting, which is worse than not
 *   showing it.
 * - **`pageshow` clears it.** Going Back can restore this page from the
 *   back/forward cache exactly as it was -- bar included -- so a restored
 *   page would show a permanent bar for a navigation that finished long ago.
 */
export function useLeavingPage() {
  const { begin } = usePendingWork();
  const releaseRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    function clear(event: PageTransitionEvent) {
      // `persisted` is the bfcache restore. A normal load has nothing to
      // clear, and calling release twice is a no-op anyway.
      if (!event.persisted) return;
      releaseRef.current?.();
      releaseRef.current = null;
    }
    window.addEventListener("pageshow", clear);
    return () => {
      window.removeEventListener("pageshow", clear);
      releaseRef.current?.();
      releaseRef.current = null;
    };
  }, []);

  return useCallback(() => {
    if (releaseRef.current) return;
    releaseRef.current = begin();
  }, [begin]);
}
