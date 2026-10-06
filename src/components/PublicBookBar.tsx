"use client";

import { usePricing } from "@/components/pricing/PricingProvider";
import Link from "@/components/system/ProgressLink";
import { usePathname } from "next/navigation";
import { isBookBarRoute } from "@/lib/dashboardShellRoutes";
import { BOOK_CONNECTOR } from "@/lib/marketingNav";

/**
 * The phone's sticky booking bar on the public pages.
 *
 * On a phone the header's links live behind the menu button, so the one
 * action the site exists for was either at the top of the page or at the
 * very bottom of it -- never where somebody stopped reading. This keeps it
 * one tap away on every marketing page below `lg`, where the header itself
 * carries a Book button instead.
 *
 * `data-tabbar` lifts toasts and the scroll hint above it (see
 * --app-bottom-inset in globals.css), and the in-flow spacer stops it
 * covering the end of the footer.
 */
export default function PublicBookBar({
  homeVisitEnabled: homeVisitSwitch,
}: {
  homeVisitEnabled: boolean;
}) {
  const pathname = usePathname();
  // Off outside India unless an admin allows it (Countries & currency).
  const { homeVisitsOffered } = usePricing();
  const homeVisitEnabled = homeVisitSwitch && homeVisitsOffered;
  if (!isBookBarRoute(pathname)) return null;

  return (
    <>
      <div aria-hidden="true" className="h-[calc(4.75rem+env(safe-area-inset-bottom))] lg:hidden" />
      <div
        data-tabbar=""
        className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-slate-200 bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur lg:hidden print:hidden"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-slate-500">
            {homeVisitEnabled ? "Video, or a visit at home" : "Over video, wherever you are"}
          </p>
          <p className="truncate text-sm font-bold text-slate-900">Licensed physio</p>
        </div>
        <Link
          href={BOOK_CONNECTOR.href}
          className="inline-flex h-12 shrink-0 items-center justify-center rounded-xl bg-teal-700 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800"
        >
          {BOOK_CONNECTOR.label}
        </Link>
      </div>
    </>
  );
}
