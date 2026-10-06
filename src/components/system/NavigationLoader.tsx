"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { usePendingWork } from "@/lib/pendingWork";
import { isDashboardShellRoute } from "@/lib/dashboardShellRoutes";
import WordRollLoader from "@/components/system/WordRollLoader";

/** Below this a page change reads as instant, and a loader would only flash. */
const APPEAR_AFTER_MS = 300;

/**
 * The word-roll loader over the page while the next page is on its way.
 *
 * Drawn under the chrome rather than instead of it: it sits at z-20, and the
 * public nav, every dashboard's sidebar, rail, top bar and phone tab bar are
 * z-30 and up -- so the navigation you just used stays exactly where it was,
 * and only the content area waits. That is the whole reason the dashboards
 * have no `loading.tsx` any more: a loading boundary replaces the page, and
 * each dashboard's sidebar lives inside its page, so every tab tap blanked
 * the sidebar until the new one arrived.
 *
 * Only for moving to another page (`begin("navigation")`). A refresh after a
 * button press keeps the person where they are and gets the teal bar alone.
 * The previous page stays faintly visible behind it, so nothing jumps.
 */
export default function NavigationLoader({ offsetTop = false }: { offsetTop?: boolean }) {
  const { navigating } = usePendingWork();
  const pathname = usePathname();
  const [shown, setShown] = useState(false);

  // Adjust-state-while-rendering, as RouteProgress does: the navigation
  // ending must hide the loader in the same render, not one frame later.
  const [wasNavigating, setWasNavigating] = useState(navigating);
  if (navigating !== wasNavigating) {
    setWasNavigating(navigating);
    if (!navigating && shown) setShown(false);
  }

  useEffect(() => {
    if (!navigating) return;
    const timer = setTimeout(() => setShown(true), APPEAR_AFTER_MS);
    return () => clearTimeout(timer);
  }, [navigating]);

  if (!shown) return null;

  // Centre the mark in the content area: clear of the debug bar, the top
  // bar or nav, and on a dashboard the rail or sidebar and the phone tab bar.
  const dashboard = isDashboardShellRoute(pathname);
  const top = offsetTop ? (dashboard ? "pt-[97px] lg:pt-[41px]" : "pt-[105px]") : dashboard ? "pt-14 lg:pt-0" : "pt-16";
  const side = dashboard ? "pb-20 lg:pb-0 lg:pl-[88px] 2xl:pl-64" : "";

  return (
    <div
      data-testid="navigation-loader"
      className={`navigation-loader fixed inset-0 z-20 flex items-center justify-center bg-slate-50/90 backdrop-blur-sm ${top} ${side}`}
    >
      <WordRollLoader label="Loading the next page…" />
    </div>
  );
}
