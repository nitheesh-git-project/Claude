"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";

// Shown once the admin-configured Session Timeout of Inactivity has elapsed
// and the session has already been signed out. Deliberately not dismissible
// -- there is no session left behind it, so the only real choices are the
// two this offers: sign in again, or leave for the public site.
//
// The dashboard behind it stays on screen (blurred, inert) rather than being
// replaced by a redirect, so the user can see where they were and understand
// what happened instead of finding themselves on the homepage with no
// explanation.
export default function SessionTimeoutDialog({
  open,
  loginHref,
}: {
  open: boolean;
  // The login page for whichever role's dashboard this is -- see
  // LOGIN_HREF_BY_BASE_PATH in dashboardNavItems.
  loginHref: string;
}) {
  useEffect(() => {
    if (!open) return;
    // The page behind is scrollable and still interactive-looking; freeze it
    // so the dialog is the only thing that can be moved or clicked.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-timeout-title"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm p-8 text-center"
          >
            <motion.div
              // A slow breathing pulse rather than a spinner -- nothing is
              // loading, the clock simply ran out.
              animate={{ scale: [1, 1.08, 1], opacity: [1, 0.75, 1] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center text-2xl mx-auto mb-4"
            >
              <i className="fa-solid fa-hourglass-end"></i>
            </motion.div>
            <h2 id="session-timeout-title" className="text-lg font-bold text-slate-900">
              You&apos;ve been signed out
            </h2>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              We noticed no activity on this page for a while, so we signed you
              out to keep your account safe. Feel free to sign back in whenever
              you&apos;re ready — everything is right where you left it.
            </p>
            {/* Plain anchors, not next/link: the session was just cleared,
                and a hard navigation is what guarantees the next request
                carries the cleared cookies -- the same reasoning every
                sign-out handler in this codebase already follows. A soft
                transition would also carry this now-signed-out page's
                client state along with it. */}
            <div className="flex items-center gap-3 mt-6">
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded-xl text-xs transition"
              >
                Home
              </a>
              <a
                href={loginHref}
                className="flex-1 bg-teal-700 hover:bg-teal-800 text-white font-bold py-3 px-4 rounded-xl text-xs transition shadow"
              >
                Log In
              </a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
