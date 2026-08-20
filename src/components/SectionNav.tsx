"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useRegisterSectionIds } from "@/components/SectionNavContext";
import { scrollToSection } from "@/lib/scrollToSection";

export type SectionNavItem = { id: string; label: string; icon: string };

/**
 * Floating "jump to section" rail for the public marketing pages --
 * collapsed to icon
 * pills, expands to show the label on hover/active, click smooth-scrolls to
 * the matching section and the active pill stays in sync while the visitor
 * scrolls normally.
 *
 * Nothing is active until the visitor has scrolled and a section actually
 * reaches the middle of the viewport, so a freshly opened page shows bare
 * icons with no pill. Seeding the active id from the first item instead
 * used to light up "What We Treat" over the home page's hero -- not the
 * section being read, and it never self-corrected.
 *
 * Gated to very wide viewports (min-[1440px]) rather than the usual lg:
 * breakpoint -- these pages' sections are full-width (max-w-7xl, up to
 * 1280px) with no reserved sidebar gutter, so anything narrower than that
 * plus the rail's own width would sit the rail on top of hero copy instead
 * of beside it.
 */
export default function SectionNav({ items }: { items: SectionNavItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const ids = useMemo(() => items.map((item) => item.id), [items]);
  // Publishes the same list to the bottom-right scroll arrow, which lives in
  // the root layout and otherwise has no view of this page's sections.
  useRegisterSectionIds(ids);

  useEffect(() => {
    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    // Driven by scroll position rather than an IntersectionObserver: the
    // rail needs two things an observer cannot give together -- which
    // section crosses the viewport centre (an observer handles that), and
    // whether the page is scrolled at all (it does not, since sitting at
    // the top fires no intersection change). Reading both off one handler
    // keeps them from disagreeing. Cost is a rect read per section per
    // animation frame while scrolling, over at most a handful of sections.
    let frame = 0;
    function update() {
      frame = 0;
      // Untouched at the top of the page: the visitor has landed, not
      // arrived at a section, so the rail shows bare icons and no pill.
      // Deep links (/page#section) scroll before this runs, so they still
      // light the section they land on.
      if (window.scrollY <= 0) {
        setActiveId(null);
        return;
      }
      // Whichever section crosses the vertical centre of the viewport,
      // rather than "any part visible" -- so the active pill matches what
      // the visitor is actually reading, not whatever section happens to
      // poke into the bottom of the screen first. Last match wins, which
      // resolves a section nested inside another to the inner one.
      const centre = window.innerHeight * 0.5;
      let found: string | null = null;
      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= centre && rect.bottom >= centre) found = el.id;
      }
      setActiveId(found);
    }

    function schedule() {
      if (frame === 0) frame = requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [items]);

  return (
    <nav
      aria-label="Jump to section"
      className="fixed left-5 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-1.5 min-[1440px]:flex"
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => scrollToSection(item.id)}
            aria-current={active ? "true" : undefined}
            className={`group relative flex items-center gap-3 rounded-full py-1.5 pl-1.5 pr-1.5 text-left transition-colors ${
              active ? "text-teal-800" : "text-slate-400 hover:text-teal-700"
            }`}
          >
            {active && (
              <motion.span
                layoutId="section-nav-active"
                className="absolute inset-0 rounded-full bg-white shadow-md shadow-slate-900/10 ring-1 ring-slate-200"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span
              className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${
                active
                  ? "border-teal-600 bg-teal-600 text-white"
                  : "border-slate-200 bg-white/80 text-slate-400 backdrop-blur-sm group-hover:border-teal-300 group-hover:text-teal-600"
              }`}
            >
              <i aria-hidden="true" className={`fa-solid ${item.icon} text-xs`} />
            </span>
            <span
              className={`relative max-w-0 overflow-hidden whitespace-nowrap text-xs font-semibold opacity-0 transition-all duration-200 group-hover:max-w-[10rem] group-hover:pr-3 group-hover:opacity-100 ${
                active ? "max-w-[10rem] pr-3 opacity-100" : ""
              }`}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
