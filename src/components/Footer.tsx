"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isDashboardShellRoute } from "@/lib/dashboardShellRoutes";

export default function Footer() {
  const pathname = usePathname();
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
            <span className="text-white font-bold">Dr. Pooja&apos;s Physio</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Certified global telehealth physical therapy practice, restoring
            mobility from home.
          </p>
        </div>

        <div>
          <h4 className="text-white text-sm font-semibold mb-3">Explore</h4>
          <ul className="space-y-2 text-xs">
            <li><Link href="/conditions" className="hover:text-teal-400 transition">Conditions Treated</Link></li>
            <li><Link href="/how-it-works" className="hover:text-teal-400 transition">How It Works</Link></li>
            <li><Link href="/team" className="hover:text-teal-400 transition">Specialist Team</Link></li>
            <li><Link href="/hospitals" className="hover:text-teal-400 transition">For Hospitals (B2B)</Link></li>
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
            <li><i className="fa-solid fa-envelope text-teal-500 mr-2"></i>hello@drpoojaphysio.com</li>
            <li><i className="fa-brands fa-whatsapp text-teal-500 mr-2"></i>+91 XXXXX XXXXX</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-800 py-4 text-center text-[11px] text-slate-500">
        © {new Date().getFullYear()} Dr. Pooja&apos;s Physio. All rights reserved.
      </div>
    </footer>
  );
}
