"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";

export type SectionNavItem = { id: string; label: string; icon: string };

/**
 * Floating "jump to section" rail for the home page -- collapsed to icon
 * pills, expands to show the label on hover/active, click smooth-scrolls to
 * the matching section and an IntersectionObserver keeps the active pill in
 * sync while the visitor scrolls normally.
 *
 * Gated to very wide viewports (min-[1440px]) rather than the usual lg:
 * breakpoint -- the home page's sections are full-width (max-w-7xl, up to
 * 1280px) with no reserved sidebar gutter, so anything narrower than that
 * plus the rail's own width would sit the rail on top of hero copy instead
 * of beside it.
 */
export default function SectionNav({ items }: { items: SectionNavItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    // Tracks whichever section is crossing the vertical centre of the
    // viewport, rather than "any part visible" -- so the active pill
    // matches whatever the visitor is actually reading, not whatever
    // section happens to poke into the bottom of the screen first.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  function goTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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
            onClick={() => goTo(item.id)}
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
