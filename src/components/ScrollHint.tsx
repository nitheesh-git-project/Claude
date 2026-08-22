"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { isFrontPageRoute } from "@/lib/dashboardShellRoutes";
import { useSectionIds } from "@/components/SectionNavContext";
import { nextSectionId, scrollToSection } from "@/lib/scrollToSection";

/**
 * Floating "there's more below" control for the public marketing pages -- a
 * bottom-right chevron that bobs inside a still button (mostly smooth, with
 * a couple of sharper little nudges per cycle) to read as "scroll down,"
 * fades in on landing, and disappears once the visitor is near the bottom of
 * the page (or the page never had enough content to scroll in the first
 * place).
 *
 * Tapping it advances one section at a time, using the same section list the
 * left-hand rail renders (published through SectionNavProvider), so the two
 * controls always agree on what "the next section" is. It was previously a
 * decorative div with no handler, which read as a button and did nothing.
 * Where a page publishes no sections it falls back to one viewport-worth of
 * scroll, so the control is never inert.
 *
 * Scoped to isFrontPageRoute rather than the inverse of the dashboard/auth
 * checks -- see that function's comment. Sign-in and every account/booking
 * route fall outside it by construction.
 */
export default function ScrollHint() {
  const pathname = usePathname();
  const onFrontPage = isFrontPageRoute(pathname);
  const sectionIds = useSectionIds();
  // The bob is decoration on a control, so it goes entirely under reduced
  // motion -- an endlessly moving target is harder to hit, not just showier.
  const reduceMotion = useReducedMotion();
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

  function goToNext() {
    const id = nextSectionId(sectionIds);
    if (id) {
      scrollToSection(id);
      return;
    }
    // No section left below (or none published): move a screenful rather
    // than nothing, which keeps the last tap before the fade-out useful.
    window.scrollBy({ top: Math.round(window.innerHeight * 0.9), behavior: "smooth" });
  }

  return (
    <AnimatePresence>
      {onFrontPage && visible && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 14 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-5 right-5 z-30 sm:bottom-7 sm:right-7"
        >
          <motion.button
            type="button"
            onClick={goToNext}
            aria-label="Scroll to next section"
            initial={false}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white/90 text-teal-700 shadow-lg shadow-slate-900/10 backdrop-blur-sm transition-colors hover:border-teal-300 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
          >
            {/*
              The bob lives on the chevron, not on the button, so the hit
              target itself never moves. It used to be the button that bobbed,
              which made a control whose whole job is being tapped a target
              that is never twice in the same place -- the same reason the bob
              already stopped on hover, applied to the approach rather than
              only the last moment before the tap. It also made the button
              permanently "unstable" to anything that waits for a settled
              element before clicking, which is how the automated checks
              caught it.
            */}
            <motion.i
              aria-hidden="true"
              className="fa-solid fa-chevron-down text-sm"
              initial={false}
              animate={reduceMotion ? { y: 0 } : { y: [0, 3, 0, 3, 0, 7, 0] }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : {
                      duration: 2.6,
                      repeat: Infinity,
                      ease: "easeInOut",
                      times: [0, 0.16, 0.32, 0.48, 0.64, 0.82, 1],
                    }
              }
            />
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
