"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useHydrationSafeReducedMotion } from "@/lib/useHydrationSafeReducedMotion";
import { CARE_AREAS } from "@/lib/careAreas";
import { photo } from "@/lib/marketingPhotos";
import BodyFocus from "@/components/marketing/BodyFocus";

/**
 * What we treat - one area at a time: photograph on the left, the answer on
 * the right, and a picker to move between them.
 *
 * This band has been through both failure modes, and the shape below is what
 * is left after each one.
 *
 * Six photo tiles at once was too dense: every picture competed for the same
 * attention, and because a photograph of a patient exercising at home cannot
 * distinguish back pain from knee pain, all six said the same sentence while
 * taking most of the page. Stripping the photography out fixed the density
 * but threw away the thing that makes this site legible at a glance.
 *
 * Showing one at a time fixes both. The photograph gets enough room to be
 * looked at instead of skimmed past, and because only one panel is on screen
 * the copy can be a real answer - what we look at, what happens next - rather
 * than the six words a card could fit. The other five are one tap away and
 * cost no vertical space.
 *
 * Three interaction rules, none of them optional:
 *
 * - **It never moves on its own.** The home page already carries an
 *   auto-rotating walkthrough (`JourneySteps`); a second thing moving while
 *   you read the first is worse than either alone. Every change here is
 *   something the visitor did.
 * - **Swipe, arrows and the picker are the same action.** Touch drags the
 *   photo, the arrow buttons step, and the picker jumps - all through
 *   `select()`, so they cannot disagree about which area is showing.
 * - **It is a real tablist.** Chips are tabs with roving focus and arrow-key
 *   support, and the panel is labelled by the active one, so keyboard and
 *   screen-reader users get the behaviour pointer users get. The label is
 *   deliberately not "How the process works" - that belongs to JourneySteps,
 *   and two tablists sharing a name makes both unfindable.
 */

// Far enough that a hesitant thumb during a vertical scroll does not count,
// close enough that a deliberate flick always does.
const SWIPE_DISTANCE = 60;
const SWIPE_VELOCITY = 250;

export default function CareAreaShowcase({
  href,
  ctaLabel,
}: {
  /** Where the "start here" button on each area goes. */
  href: string;
  ctaLabel: string;
}) {
  const [active, setActive] = useState(0);
  // Which way the panel should enter from: +1 forward, -1 back. Kept in state
  // beside the index rather than derived, because a jump from the picker can
  // move either way and the animation has to match the direction travelled.
  const [direction, setDirection] = useState(1);
  // Hydration-safe: motion's hook answers on the first client render, so the
  // initial styles differed from the server's for reduced-motion visitors.
  const reduceMotion = useHydrationSafeReducedMotion();
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();

  const area = CARE_AREAS[active];
  const count = CARE_AREAS.length;

  const select = useCallback(
    (next: number, opts: { focus?: boolean } = {}) => {
      // Wraps, so the arrows never dead-end and a swipe past the last area
      // returns to the first instead of doing nothing.
      const index = (next + count) % count;
      setDirection(index === active ? 0 : index > active ? 1 : -1);
      setActive(index);
      if (opts.focus) tabsRef.current[index]?.focus();
    },
    [active, count]
  );

  function onTabKeyDown(event: React.KeyboardEvent) {
    const keys: Record<string, number> = {
      ArrowRight: active + 1,
      ArrowLeft: active - 1,
      Home: 0,
      End: count - 1,
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(next, { focus: true });
  }

  const slide = reduceMotion ? 0 : 28;

  // The figure on the photograph tells each area's story in one breath: it
  // glows where it hurts, then cools to teal. Replayed on every pick, and
  // shown cooled at once under reduced motion.
  const [cooled, setCooled] = useState(false);
  useEffect(() => {
    // Every pick starts the story again from "sore".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCooled(reduceMotion);
    if (reduceMotion) return;
    const t = window.setTimeout(() => setCooled(true), 1400);
    return () => window.clearTimeout(t);
  }, [active, reduceMotion]);

  const picker = (
    <div
      role="tablist"
      aria-label="Areas of practice"
      aria-orientation="horizontal"
      onKeyDown={onTabKeyDown}
      // A row of tiles you can swipe on a phone, a grid of six from lg: each
      // names the complaint and shows where on the body it sits, so a
      // visitor finds theirs before reading a word of the answer.
      className="-mx-4 mb-8 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6"
    >
      {CARE_AREAS.map((item, index) => {
        const selected = index === active;
        return (
          <motion.button
            key={item.key}
            ref={(el) => {
              tabsRef.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${item.key}`}
            aria-selected={selected}
            aria-controls={`${baseId}-panel-${item.key}`}
            // Roving tabindex: one stop for the whole set, then arrow keys.
            tabIndex={selected ? 0 : -1}
            onClick={() => select(index)}
            whileHover={reduceMotion ? undefined : { y: -3 }}
            whileTap={reduceMotion ? undefined : { scale: 0.97 }}
            className={`flex w-40 shrink-0 snap-start items-center gap-3 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 sm:w-auto ${
              selected
                ? "border-teal-600 bg-teal-50 shadow-[0_10px_24px_-14px_rgba(15,118,110,0.6)]"
                : "border-slate-200 bg-white hover:border-teal-300"
            }`}
          >
            <span className="flex h-14 w-8 shrink-0 items-center justify-center" aria-hidden="true">
              <BodyFocus
                area={item.body.area}
                state={selected && cooled ? "better" : "sore"}
                reduceMotion={reduceMotion || !selected}
                className="h-14 w-auto"
              />
            </span>
            <span className="min-w-0">
              <span className={`block text-sm font-bold leading-tight ${selected ? "text-teal-900" : "text-slate-800"}`}>
                {item.title}
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-slate-500">{item.body.label}</span>
            </span>
          </motion.button>
        );
      })}
    </div>
  );

  return (
    <div>
      {picker}
      <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
        {/* PHOTOGRAPH - draggable on touch. The fixed aspect ratio means the
            panel never changes height as areas swap, which is what stops the
            page jumping under the reader. */}
        <div className="relative">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[1.5rem] bg-slate-100 shadow-[0_24px_56px_-32px_rgba(15,23,42,0.45)] ring-1 ring-slate-900/5">
            <AnimatePresence initial={false} custom={direction} mode="popLayout">
              <motion.div
                key={area.key}
                custom={direction}
                initial={{ opacity: 0, x: direction * slide }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -slide }}
                transition={{ duration: reduceMotion ? 0.15 : 0.45, ease: [0.16, 1, 0.3, 1] }}
                // dragDirectionLock so a vertical scroll that starts on the
                // photo scrolls the page instead of fighting the carousel.
                drag="x"
                dragDirectionLock
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.12}
                onDragEnd={(_, info) => {
                  const far = Math.abs(info.offset.x) > SWIPE_DISTANCE;
                  const fast = Math.abs(info.velocity.x) > SWIPE_VELOCITY;
                  if (!far && !fast) return;
                  select(info.offset.x < 0 ? active + 1 : active - 1);
                }}
                className="absolute inset-0 cursor-grab active:cursor-grabbing"
              >
                <Image
                  src={photo(area.photo)}
                  alt={area.photoAlt}
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="pointer-events-none select-none object-cover"
                />
              </motion.div>
            </AnimatePresence>

            {/* Where it hurts, on the photograph: the sore area glows, then
                cools. A drawing of an area, not a diagnosis. */}
            <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-3 rounded-2xl bg-white/90 py-2 pl-2 pr-4 shadow-lg ring-1 ring-slate-900/5 backdrop-blur sm:bottom-4 sm:left-4">
              <BodyFocus
                area={area.body.area}
                state={cooled ? "better" : "sore"}
                reduceMotion={reduceMotion}
                className="h-14 w-auto sm:h-20"
              />
              <span>
                <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 sm:text-[11px]">
                  {cooled ? "What we work on" : "Where it hurts"}
                </span>
                <span className="block text-sm font-bold text-slate-900">{area.body.label}</span>
              </span>
            </div>
          </div>

          {/* Step controls sit under the photo on the side it belongs to,
              rather than floating over the image where they cover a face. */}
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => select(active - 1)}
              aria-label="Previous area"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-teal-300 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              <i className="fa-solid fa-arrow-left text-xs" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => select(active + 1)}
              aria-label="Next area"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-teal-300 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
            </button>
            <p className="text-xs font-medium text-slate-500">
              {active + 1} of {count}
              {/* Shown on every width: swipe is the affordance that needs
                  announcing on a phone, and that is exactly the width where
                  hiding it left no hint at all. */}
              <span className="ml-2">· swipe, or tap one above</span>
            </p>
          </div>
        </div>

        {/* THE ANSWER */}
        <div>
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={area.key}
              id={`${baseId}-panel-${area.key}`}
              role="tabpanel"
              aria-labelledby={`${baseId}-tab-${area.key}`}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
              transition={{ duration: reduceMotion ? 0.15 : 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <h3 className="font-display text-2xl font-bold tracking-[-0.02em] text-slate-900 sm:text-3xl">
                {area.title}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600 sm:text-base">
                {area.detail}
              </p>

              <p className="mt-7 text-[11px] font-bold uppercase tracking-[0.18em] text-teal-700">
                What your first session looks at
              </p>
              <ul className="mt-3 space-y-2.5">
                {area.checks.map((check) => (
                  <li key={check} className="flex items-start gap-3 text-sm text-slate-600">
                    <i
                      className="fa-solid fa-circle-check mt-0.5 shrink-0 text-teal-600"
                      aria-hidden="true"
                    />
                    {check}
                  </li>
                ))}
              </ul>

              <Link
                href={href}
                className="group mt-8 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                {ctaLabel}
                <i
                  className="fa-solid fa-arrow-right text-[11px] transition-transform group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </Link>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

    </div>
  );
}
