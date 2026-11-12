"use client";

import { usePricing } from "@/components/pricing/PricingProvider";
import Link from "@/components/system/ProgressLink";
import { usePathname } from "next/navigation";
import { isBookBarRoute } from "@/lib/dashboardShellRoutes";
import { BOOK_CONNECTOR } from "@/lib/marketingNav";
import { WhatsAppGlyph } from "@/components/visuals/BrandGlyphs";
import type { PublicContactLinks } from "@/lib/contactLinks";

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
  contact = { whatsapp: null, call: null },
}: {
  /** Home visits are bookable (switch on, an area served, a price set). */
  homeVisitEnabled: boolean;
  /** Only the links the clinic has filled in. */
  contact?: PublicContactLinks;
}) {
  const pathname = usePathname();
  // Off outside India unless an admin allows it (Countries & currency).
  const { homeVisitsOffered } = usePricing();
  const homeVisitEnabled = homeVisitSwitch && homeVisitsOffered;
  if (!isBookBarRoute(pathname)) return null;

  // On the Home Visit page the question in the visitor's head is "do you come
  // to me?", and the video-session button answers a different one. The bar
  // asks that question instead, and only while home visits are bookable --
  // otherwise the page is an announcement and the bar keeps its usual job.
  const onHomeVisitPage = homeVisitEnabled && pathname === "/home-visit";
  const action = onHomeVisitPage
    ? { href: "/book-home-visit", label: "Check my pincode" }
    : { href: BOOK_CONNECTOR.href, label: BOOK_CONNECTOR.label };
  // A person to ask, beside the button rather than competing with it: WhatsApp
  // where the clinic has one, a phone call otherwise, nothing when neither is set.
  const ask = contact.whatsapp
    ? { href: contact.whatsapp, label: "Chat on WhatsApp (opens in a new tab)", whatsapp: true }
    : contact.call
      ? { href: contact.call, label: "Call us", whatsapp: false }
      : null;

  return (
    <>
      <div aria-hidden="true" className="h-[calc(4.75rem+env(safe-area-inset-bottom))] lg:hidden" />
      <div
        data-tabbar=""
        className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-slate-200 bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur lg:hidden print:hidden"
      >
        {/* Under 420px the two lines could only show "Video or a visit a..."
            beside the buttons, so they step aside and the button takes the
            width: a cut-off sentence is worse than none. */}
        <div className="hidden min-w-0 flex-1 min-[420px]:block">
          <p className="truncate text-xs text-slate-600">
            {homeVisitEnabled ? "Video, or a visit at home" : "Over video, wherever you are"}
          </p>
          <p className="truncate text-sm font-bold text-slate-900">Licensed physio</p>
        </div>
        {ask && (
          <a
            href={ask.href}
            aria-label={ask.label}
            {...(ask.whatsapp ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg text-emerald-700 transition hover:bg-slate-50"
          >
            {ask.whatsapp ? <WhatsAppGlyph /> : <i aria-hidden="true" className="fa-solid fa-phone text-teal-700" />}
          </a>
        )}
        <Link
          href={action.href}
          className="inline-flex h-12 flex-1 shrink-0 items-center justify-center rounded-xl bg-teal-700 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 min-[420px]:flex-none"
        >
          {action.label}
        </Link>
      </div>
    </>
  );
}
