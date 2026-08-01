"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isDashboardShellRoute } from "@/lib/dashboardShellRoutes";

const links = [
  { href: "/", label: "Home" },
  { href: "/conditions", label: "Conditions Treated" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/team", label: "Specialist Team" },
  { href: "/faq", label: "FAQ" },
  { href: "/hospitals", label: "For Hospitals (B2B)" },
];

export default function Navbar({ offsetTop = false }: { offsetTop?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Just a boolean -- every role's dashboard is now its own app shell with
  // its own profile card and Log Out control, so this nav no longer needs
  // to know WHO is logged in (name/avatar/role), only whether to hide the
  // Sign In / Get Started buttons.
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Read auth state on the client rather than in a Server Component, so
    // the marketing pages this nav sits on can stay statically generated /
    // ISR-cached instead of every route being forced dynamic just to know
    // whether to hide the Sign In / Get Started buttons.
    const supabase = createClient();
    let active = true;

    async function loadAuthState() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (active) setIsLoggedIn(!!session?.user);
    }

    loadAuthState();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => loadAuthState());

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Each of the 4 role dashboards is its own full-height dark app shell
  // (sidebar + content, no page scroll past the viewport) rather than a page
  // that sits below this marketing nav -- exact match only, so sub-pages
  // like /patient/dashboard/profile (which aren't part of a shell) keep
  // this nav for navigation.
  if (isDashboardShellRoute(pathname)) {
    return null;
  }

  return (
    <nav
      className={`bg-white border-b border-slate-200 sticky z-40 shadow-sm ${
        offsetTop ? "top-[41px]" : "top-0"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link href="/" className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-teal-700 text-white flex items-center justify-center font-bold text-xl shadow-md">
              <i className="fa-solid fa-user-doctor"></i>
            </div>
            <div>
              <span className="text-lg font-bold text-slate-800 tracking-tight block leading-tight">
                Dr. Pooja&apos;s Physio
              </span>
              <span className="text-[10px] font-semibold text-teal-700 uppercase tracking-widest block">
                Global Telehealth Platform
              </span>
            </div>
          </Link>

          <div className="hidden md:flex items-center space-x-6 text-sm font-medium text-slate-600">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hover:text-teal-700 transition"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {!isLoggedIn && (
            <div className="hidden md:flex items-center space-x-3">
              <Link
                href="/patient/login"
                className="text-sm font-semibold text-slate-700 hover:text-teal-700 px-3 py-2 transition"
              >
                Sign In
              </Link>
              <Link
                href="/get-started"
                className="bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold px-4 py-2 rounded-xl transition shadow-sm flex items-center gap-1.5"
              >
                Get Started <i className="fa-solid fa-arrow-right text-xs"></i>
              </Link>
            </div>
          )}

          <button
            onClick={() => setOpen(!open)}
            className="md:hidden text-slate-700 text-xl p-2"
            aria-label="Toggle menu"
          >
            <i className={`fa-solid ${open ? "fa-xmark" : "fa-bars"}`}></i>
          </button>
        </div>

        {open && (
          <div className="md:hidden pb-4 flex flex-col space-y-1 text-sm font-medium text-slate-600">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="py-2 hover:text-teal-700 transition"
              >
                {link.label}
              </Link>
            ))}
            {!isLoggedIn && (
              <>
                <Link
                  href="/patient/login"
                  onClick={() => setOpen(false)}
                  className="py-2 font-semibold text-slate-700"
                >
                  Sign In
                </Link>
                <Link
                  href="/get-started"
                  onClick={() => setOpen(false)}
                  className="mt-2 bg-teal-700 text-white text-center font-semibold px-4 py-2.5 rounded-xl"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
