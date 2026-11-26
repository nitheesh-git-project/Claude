"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { heroCueAtTop } from "@/lib/heroScrollCue";

/**
 * "See what's below", at the foot of a public page's opening screen.
 *
 * On a large screen the hero is a complete composition -- photograph, headline,
 * buttons -- and where the page ends there it reads as a finished landing page
 * with nothing underneath (visitors said exactly that of /conditions, /faq and
 * the rest). A phone never has the problem: the hero runs past the fold and the
 * next band shows. So the cue is for lg and up only, where the fold can land
 * beneath the hero.
 *
 * The owner chose this design from five on a canvas: a short line over three
 * chevrons that light up one after another, with no circle or box around
 * them. It replaced a bouncing arrow in a 40 px circle that was taller than
 * the fixed 64 px row it sat in, so the next band was drawn over its bottom,
 * and that stayed on screen until the visitor had scrolled 120 px.
 *
 * Now the row is as tall as its content plus a reserved margin, so nothing
 * can clip it, and it fades out after the first few pixels of scroll
 * (`HERO_CUE_HIDE_AFTER_PX`) -- the same moment the small corner arrow
 * (ScrollHint) takes over. Hidden, it keeps its space, so the page never
 * shifts. It sits in the hero's own flow rather than over the photograph, so
 * it cannot cover the overlay card or the figures at any width.
 *
 * The cascade is decoration: under reduced motion the chevrons stand still
 * at a steady tint, and the control works the same.
 */
const STEPS = [0, 1, 2] as const;

export default function HeroScrollCue({ label = "See what's below" }: { label?: string }) {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [atTop, setAtTop] = useState(true);

  useEffect(() => {
    function update() {
      setAtTop(heroCueAtTop(window.scrollY));
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

  const animate = !reduceMotion && atTop;

  return (
    <div
      ref={rootRef}
      data-hero-scroll-cue=""
      // Sized by its content plus a reserved bottom margin -- never a fixed
      // height smaller than what it draws. Absent below lg altogether.
      className="relative hidden justify-center pb-7 pt-2 lg:flex"
    >
      <button
        type="button"
        onClick={goDown}
        tabIndex={atTop ? 0 : -1}
        aria-hidden={atTop ? undefined : true}
        // No aria-label: the visible words are the accessible name (an
        // aria-label that does not contain them fails WCAG 2.5.3).
        className={`group flex min-h-11 cursor-pointer flex-col items-center gap-2 rounded-xl px-4 py-1.5 transition-[opacity,transform] duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 ${
          atTop ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1.5 opacity-0"
        }`}
      >
        <span className="text-[13px] font-semibold text-teal-700 transition-colors group-hover:text-teal-900">
          {label}
        </span>
        <span aria-hidden="true" className="flex flex-col items-center">
          {STEPS.map((step) => (
            <motion.svg
              key={step}
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              // Overlapped so the three read as one downward stroke.
              className={`block text-teal-700 group-hover:text-teal-900 ${step > 0 ? "-mt-2" : ""}`}
              initial={false}
              // Each chevron brightens in turn, top to bottom, then rests --
              // a cascade pointing down, with no hop to catch the eye twice.
              animate={animate ? { opacity: [0.18, 1, 0.18, 0.18], y: [-2, 1, 2, -2] } : { opacity: 0.7, y: 0 }}
              transition={
                animate
                  ? {
                      duration: 1.8,
                      repeat: Infinity,
                      ease: "easeInOut",
                      times: [0, 0.35, 0.6, 1],
                      delay: step * 0.22,
                    }
                  : { duration: 0.2 }
              }
            >
              <path d="M6 9l6 6 6-6" />
            </motion.svg>
          ))}
        </span>
      </button>
    </div>
  );
}
