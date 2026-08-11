"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { isFrontPageRoute } from "@/lib/dashboardShellRoutes";

/**
 * Floating "there's more below" cue for the public marketing pages -- a
 * bottom-right chevron that bobs (mostly smooth, with a couple of sharper
 * little nudges per cycle) to read as "scroll down," fades in on landing,
 * and disappears once the visitor is near the bottom of the page (or the
 * page never had enough content to scroll in the first place).
 *
 * Scoped to isFrontPageRoute rather than the inverse of the dashboard/auth
 * checks -- see that function's comment. Sign-in and every account/booking
 * route fall outside it by construction.
 */
export default function ScrollHint() {
  const pathname = usePathname();
  const onFrontPage = isFrontPageRoute(pathname);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // No listeners to attach off a front page -- render already gates on
    // onFrontPage, so a stale `visible` here never actually shows anything.
    if (!onFrontPage) return;

    function update() {
      const scrollable = document.documentElement.scrollHeight > window.innerHeight + 80;
      const nearBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 48;
      setVisible(scrollable && !nearBottom);
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [onFrontPage, pathname]);

  return (
    <AnimatePresence>
      {onFrontPage && visible && (
        <motion.div
          aria-hidden="true"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 14 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-5 right-5 z-30 sm:bottom-7 sm:right-7"
        >
          <motion.div
            animate={{ y: [0, 5, 0, 5, 0, 12, 0] }}
            transition={{
              duration: 2.6,
              repeat: Infinity,
              ease: "easeInOut",
              times: [0, 0.16, 0.32, 0.48, 0.64, 0.82, 1],
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-teal-700 shadow-lg shadow-slate-900/10 backdrop-blur-sm"
          >
            <i aria-hidden="true" className="fa-solid fa-chevron-down text-sm" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
