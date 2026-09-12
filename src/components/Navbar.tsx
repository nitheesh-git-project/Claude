"use client";

// Every public-site navigation goes through the bar. A `<Link>` click never
// reaches `useRouter`, so nothing told PendingWorkProvider a page change had
// started -- ProgressLink reports it from inside the link, which is the only
// place Next's own `useLinkStatus` can be read.
import Link from "@/components/system/ProgressLink";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useAccountDestination } from "@/lib/useAccountDestination";
import { isAuthCtaHiddenRoute, isNavHiddenRoute } from "@/lib/dashboardShellRoutes";
import { MARKETING_PAGES } from "@/lib/marketingNav";


export default function Navbar({
  offsetTop = false,
  siteName,
  siteTagline,
  homeVisitEnabled = false,
}: {
  offsetTop?: boolean;
  siteName: string;
  siteTagline: string;
  homeVisitEnabled?: boolean;
}) {
  // Derived from marketingNav.ts rather than written out here, so the header,
  // the home page's connector grid and every page's "where to go next" strip
  // can never disagree about what pages exist or what they are called. Home
  // Visit is dropped rather than listed when the clinic has switched it off:
  // the page itself 404s while the feature is off, so a link to it is a dead
  // end.
  const links = MARKETING_PAGES.filter(
    (page) => homeVisitEnabled || !page.requiresHomeVisit
  );
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Just a boolean -- every role's dashboard is now its own app shell with
  // its own profile card and Log Out control, so this nav no longer needs
  // to know WHO is logged in (name/avatar/role), only whether to hide the
  // Sign In / Get Started buttons.


  // Where a signed-in account's own button goes, and what it says --
  // shared with the booking wizard's exit link, so the two surfaces that
  // offer somebody a way back into the app cannot grow different answers
  // about where that is. See useAccountDestination for the three states and
  // why the href is direct rather than /dashboard.
  const { signedIn, destination } = useAccountDestination();
  const [navigating, setNavigating] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Link's onClick sets navigating=true optimistically, but this is a soft
  // client-side nav -- it never resolves to false if the navigation gets
  // interrupted (browser back button, the BookingWizard's unsaved-progress
  // confirm dialog, etc.) and lands back on a route where this Navbar is
  // still mounted. Reset during render on every pathname change (React's
  // adjust-state-while-rendering pattern, not an effect) so the button
  // can't get stuck showing "Loading..." forever.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (navigating) setNavigating(false);
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);


  // Each of the 4 role dashboards is its own full-height dark app shell
  // (sidebar + content, no page scroll past the viewport) rather than a page
  // that sits below this marketing nav -- exact match only, so sub-pages
  // like /patient/dashboard/profile (which aren't part of a shell) keep
  // this nav for navigation.
  if (isNavHiddenRoute(pathname)) {
    return null;
  }

  // See isAuthCtaHiddenRoute -- on the auth pages themselves the nav shows
  // no Sign In / Get Started / Go to Dashboard at all, so signing in can't
  // flash a dashboard button before the page it belongs to has opened.
  const authCtaHidden = isAuthCtaHiddenRoute(pathname);

  return (
    <nav
      className={`bg-white/85 backdrop-blur-md border-b sticky z-40 transition-shadow ${
        offsetTop ? "top-[41px]" : "top-0"
      } ${scrolled ? "shadow-md border-slate-200" : "shadow-none border-transparent"}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link href="/" className="flex items-center space-x-3 group">
            <motion.div
              whileHover={{ rotate: -6, scale: 1.05 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
              className="w-10 h-10 rounded-xl bg-teal-700 text-white flex items-center justify-center font-bold text-xl shadow-md"
            >
              <i className="fa-solid fa-user-doctor"></i>
            </motion.div>
            <div>
              <span className="font-display text-lg font-bold text-slate-800 tracking-tight block leading-tight">
                {siteName}
              </span>
              <span className="text-[10px] font-semibold text-teal-700 uppercase tracking-widest block">
                {siteTagline}
              </span>
            </div>
          </Link>

          <div className="hidden md:flex items-center space-x-6 text-sm font-medium text-slate-600">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative py-1 transition-colors ${active ? "text-teal-700" : "hover:text-teal-700"}`}
                >
                  {link.label}
                  {active && (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute left-0 right-0 -bottom-1 h-0.5 rounded-full bg-teal-600"
                      transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    />
                  )}
                </Link>
              );
            })}
          </div>

          {authCtaHidden ? null : signedIn !== true ? (
            <div className="hidden md:flex items-center space-x-3">
              <Link
                href="/patient/login"
                className="text-sm font-semibold text-slate-700 hover:text-teal-700 px-3 py-2 transition"
              >
                Sign In
              </Link>
              <motion.div
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
              >
                <Link
                  href="/get-started"
                  className="bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm flex items-center gap-1.5"
                >
                  Get Started <i className="fa-solid fa-arrow-right text-xs"></i>
                </Link>
              </motion.div>
            </div>
          ) : destination ? (
            <motion.div
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="hidden md:flex items-center"
            >
              <Link
                href={destination.href}
                onClick={() => setNavigating(true)}
                aria-disabled={navigating}
                className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm flex items-center gap-1.5 aria-disabled:opacity-60 aria-disabled:pointer-events-none"
              >
                {navigating ? "Loading..." : destination.label}{" "}
                {!navigating && <i className="fa-solid fa-arrow-right text-xs"></i>}
              </Link>
            </motion.div>
          ) : null}

          <button
            onClick={() => setOpen(!open)}
            className="md:hidden text-slate-700 text-xl p-2"
            aria-label="Toggle menu"
          >
            <i className={`fa-solid ${open ? "fa-xmark" : "fa-bars"}`}></i>
          </button>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="md:hidden overflow-hidden"
            >
              <div className="pb-4 flex flex-col space-y-1 text-sm font-medium text-slate-600">
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
                {authCtaHidden ? null : signedIn !== true ? (
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
                ) : destination ? (
                  <Link
                    href={destination.href}
                    onClick={() => {
                      setOpen(false);
                      setNavigating(true);
                    }}
                    aria-disabled={navigating}
                    className="mt-2 bg-teal-700 text-white text-center font-semibold px-4 py-2.5 rounded-xl aria-disabled:opacity-60 aria-disabled:pointer-events-none"
                  >
                    {navigating ? "Loading..." : destination.label}
                  </Link>
                ) : null}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}
