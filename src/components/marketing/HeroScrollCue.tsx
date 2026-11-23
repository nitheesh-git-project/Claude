"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * "There is more below", at the foot of a public page's opening screen.
 *
 * On a large screen the hero is a complete composition -- photograph, headline,
 * buttons -- and where the page ends there it reads as a finished landing page
 * with nothing underneath (visitors said exactly that of /conditions, /faq and
 * the rest). A phone never has the problem: the hero runs past the fold and the
 * next band shows. So the cue is for lg and up only, where the fold can land
 * beneath the hero.
 *
 * It sits in the hero's own flow (a fixed-height row, not laid over the
 * photograph) so it can never cover the overlay card or the figures at any
 * width, and it goes quiet the moment the visitor scrolls: its job is done
 * once they have found the rest. The small corner arrow (ScrollHint) takes
 * over from there, and stays out of the way while this one is showing.
 *
 * The hop is decoration, so it stops under reduced motion; the label and the
 * chevron stay, and the control still works.
 */
export default function HeroScrollCue({ label = "Scroll for more" }: { label?: string }) {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [atTop, setAtTop] = useState(true);

  useEffect(() => {
    function update() {
      setAtTop(window.scrollY < 120);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  function goDown() {
    // The band right after the hero. Each band carries its own scroll margin
    // for the sticky navbar, which scrollIntoView honours.
    const hero = rootRef.current?.closest("[data-page-hero]");
    const next = hero?.nextElementSibling;
    if (next) {
      next.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      return;
    }
    window.scrollBy({ top: Math.round(window.innerHeight * 0.85), behavior: reduceMotion ? "auto" : "smooth" });
  }

  return (
    <div
      ref={rootRef}
      data-hero-scroll-cue=""
      // A fixed-height row, so hiding the button on scroll never shifts the
      // page. Absent below lg altogether.
      className="relative hidden h-16 items-start justify-center lg:flex"
    >
      <button
        type="button"
        onClick={goDown}
        tabIndex={atTop ? 0 : -1}
        aria-hidden={atTop ? undefined : true}
        aria-label="Scroll down to see more of this page"
        className={`group flex cursor-pointer flex-col items-center gap-1.5 rounded-full px-4 py-1 text-teal-800 transition-opacity duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 ${
          atTop ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700/90 transition-colors group-hover:text-teal-900">
          {label}
        </span>
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-teal-200 bg-white/90 shadow-md shadow-teal-900/10 transition-colors group-hover:border-teal-400 group-hover:bg-teal-50">
          <motion.i
            aria-hidden="true"
            className="fa-solid fa-chevron-down text-sm"
            initial={false}
            // Up-and-over then a smaller second hop and a rest, the same beat
            // as the corner arrow so the two read as one family.
            animate={reduceMotion || !atTop ? { y: 0 } : { y: [0, 6, 0, 3, 0, 0] }}
            transition={
              reduceMotion || !atTop
                ? { duration: 0 }
                : {
                    duration: 1.8,
                    repeat: Infinity,
                    ease: ["easeOut", "easeIn", "easeOut", "easeIn", "linear"],
                    times: [0, 0.18, 0.36, 0.48, 0.6, 1],
                  }
            }
          />
        </span>
      </button>
    </div>
  );
}
