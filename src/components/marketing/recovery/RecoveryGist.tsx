"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useHydrationSafeReducedMotion } from "@/lib/useHydrationSafeReducedMotion";
import type { ShowcaseProfile } from "@/lib/healthProfileShowcase";
import RecoveryStory from "./RecoveryStory";
import RecoveryTourSheet from "./RecoveryTourSheet";

/**
 * The home page's "Your recovery, tracked" band: one recovery story at a
 * time, a picker for each kind of care, and the full set one tap away.
 *
 * It never moves on its own (the carousel rule): the story plays when the
 * band comes into view and again when the visitor picks another kind of
 * care. The picker is a real tablist with arrow keys.
 */
export default function RecoveryGist({ profiles }: { profiles: ShowcaseProfile[] }) {
  const [active, setActive] = useState(0);
  const [tourOpen, setTourOpen] = useState(false);
  const reduce = useHydrationSafeReducedMotion();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = profiles[active] ?? profiles[0];

  function onKey(e: React.KeyboardEvent, i: number) {
    const last = profiles.length - 1;
    const next =
      e.key === "ArrowRight" ? (i === last ? 0 : i + 1)
      : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <div className="mx-auto max-w-4xl" data-testid="recovery-gist">
      {profiles.length > 1 && (
        <div
          role="tablist"
          aria-label="Kinds of care"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0"
        >
          {profiles.map((p, i) => (
            <button
              key={p.specialty}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              aria-selected={i === active}
              tabIndex={i === active ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKey(e, i)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition ${
                i === active
                  ? "border-teal-700 bg-teal-700 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:text-teal-800"
              }`}
            >
              <i className={`fa-solid ${p.icon} text-xs`} aria-hidden="true" />
              {p.label}
            </button>
          ))}
        </div>
      )}

      <div
        role="tabpanel"
        aria-label={current.label}
        className="mt-6 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_48px_-32px_rgba(15,23,42,0.25)] sm:p-8"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current.specialty}
            initial={reduce ? false : { opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? undefined : { opacity: 0, x: -16 }}
            transition={{ duration: 0.25 }}
          >
            <RecoveryStory profile={current} compact />
          </motion.div>
        </AnimatePresence>

        <div className="mt-6 flex justify-center border-t border-slate-100 pt-5">
          <button
            type="button"
            onClick={() => setTourOpen(true)}
            aria-haspopup="dialog"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-700 px-5 font-bold text-white shadow-sm transition hover:bg-teal-800"
          >
            See the full health profile
            <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
          </button>
        </div>
      </div>

      {tourOpen && <RecoveryTourSheet profiles={profiles} onClose={() => setTourOpen(false)} />}
    </div>
  );
}
