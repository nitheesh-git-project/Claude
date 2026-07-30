"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AvatarThumbnail from "@/components/profile/AvatarThumbnail";

const links = [
  { href: "/", label: "Home" },
  { href: "/conditions", label: "Conditions Treated" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/team", label: "Specialist Team" },
  { href: "/faq", label: "FAQ" },
  { href: "/hospitals", label: "For Hospitals (B2B)" },
];

const DASHBOARD_HREF: Record<string, string> = {
  patient: "/patient/dashboard",
  therapist: "/therapist/dashboard",
  admin: "/admin/dashboard",
  hospital: "/hospital/dashboard",
};

type NavbarAuthUser = {
  role: string;
  fullName: string;
  avatarUrl: string | null;
} | null;

export default function Navbar({ offsetTop = false }: { offsetTop?: boolean }) {
  const [open, setOpen] = useState(false);
  const [authUser, setAuthUser] = useState<NavbarAuthUser>(null);

  useEffect(() => {
    // Read auth state on the client rather than in a Server Component, so
    // the marketing pages this nav sits on can stay statically generated /
    // ISR-cached instead of every route being forced dynamic just to draw
    // the logged-in state in the corner of the nav.
    const supabase = createClient();
    let active = true;

    async function loadAuthUser() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        if (active) setAuthUser(null);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, full_name, avatar_url")
        .eq("id", session.user.id)
        .single();
      if (active) {
        setAuthUser(
          profile
            ? { role: profile.role, fullName: profile.full_name ?? "", avatarUrl: profile.avatar_url }
            : null
        );
      }
    }

    loadAuthUser();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => loadAuthUser());

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const dashboardHref = authUser ? DASHBOARD_HREF[authUser.role] : undefined;
  const firstName = authUser?.fullName?.trim().split(" ")[0] || "there";

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

          <div className="hidden md:flex items-center space-x-3">
            {authUser && dashboardHref ? (
              <Link
                href={dashboardHref}
                className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-full hover:bg-slate-100 transition"
              >
                <AvatarThumbnail
                  url={authUser.avatarUrl}
                  name={authUser.fullName || "U"}
                  size={34}
                />
                <span className="text-sm font-semibold text-slate-700">
                  Welcome, {firstName}
                </span>
              </Link>
            ) : (
              <>
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
              </>
            )}
          </div>

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
            {authUser && dashboardHref ? (
              <Link
                href={dashboardHref}
                onClick={() => setOpen(false)}
                className="mt-2 flex items-center gap-2.5 py-2 font-semibold text-slate-800"
              >
                <AvatarThumbnail
                  url={authUser.avatarUrl}
                  name={authUser.fullName || "U"}
                  size={32}
                />
                Welcome, {firstName} — Go to Dashboard
              </Link>
            ) : (
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
