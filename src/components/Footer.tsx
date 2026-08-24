"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isDashboardShellRoute } from "@/lib/dashboardShellRoutes";
import { MARKETING_PAGES } from "@/lib/marketingNav";

export default function Footer({
  siteName,
  siteDescription,
  contactEmail,
  whatsappNumber,
  contactPhone,
  footerCopyrightText,
  homeVisitEnabled = false,
}: {
  siteName: string;
  siteDescription: string;
  contactEmail: string;
  whatsappNumber: string;
  contactPhone: string;
  footerCopyrightText: string;
  homeVisitEnabled?: boolean;
}) {
  const pathname = usePathname();
  // Same list the header and the connector grids read, minus Home (the
  // wordmark above already links there). Hardcoding these was how the footer
  // ended up offering four of the seven pages under labels the rest of the
  // site had stopped using.
  const links = MARKETING_PAGES.filter(
    (page) => page.key !== "home" && (homeVisitEnabled || !page.requiresHomeVisit)
  );
  // See Navbar's matching check -- each role dashboard is its own
  // full-height dark app shell with no page scroll, so a footer below it
  // would never be reachable/visible anyway.
  if (isDashboardShellRoute(pathname)) {
    return null;
  }

  return (
    <footer className="bg-slate-900 text-slate-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid sm:grid-cols-2 md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-teal-700 text-white flex items-center justify-center font-bold shadow-md">
              <i className="fa-solid fa-user-doctor"></i>
            </div>
            <span className="font-display text-white font-bold">{siteName}</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">{siteDescription}</p>
        </div>

        <div>
          <h4 className="text-white text-sm font-semibold mb-3">Explore</h4>
          <ul className="space-y-2 text-xs">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-teal-400 transition">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-white text-sm font-semibold mb-3">Get Started</h4>
          <ul className="space-y-2 text-xs">
            <li><Link href="/get-started" className="hover:text-teal-400 transition">Book a Consultation</Link></li>
            <li><Link href="/book" className="hover:text-teal-400 transition">Booking Enquiry</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-white text-sm font-semibold mb-3">Contact</h4>
          <ul className="space-y-2 text-xs text-slate-400">
            <li><i className="fa-solid fa-envelope text-teal-500 mr-2"></i>{contactEmail}</li>
            <li><i className="fa-brands fa-whatsapp text-teal-500 mr-2"></i>{whatsappNumber}</li>
            <li><i className="fa-solid fa-phone text-teal-500 mr-2"></i>{contactPhone}</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-800 py-4 text-center text-[11px] text-slate-500">
        © {new Date().getFullYear()} {footerCopyrightText}
      </div>
    </footer>
  );
}
