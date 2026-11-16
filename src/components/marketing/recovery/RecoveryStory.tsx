"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useInView } from "motion/react";
import BodyFocus from "@/components/marketing/BodyFocus";
import { useHydrationSafeReducedMotion } from "@/lib/useHydrationSafeReducedMotion";
import { formatMeterValue, SAMPLE_NOTE, type ShowcaseProfile } from "@/lib/healthProfileShowcase";

/**
 * One health profile's story in a few seconds: sore at the first visit,
 * better at the latest review.
 *
 * It plays once, when it comes into view (and again when the visitor picks
 * another kind of care, since the parent re-keys it): the figure's sore spot
 * cools from rose to teal, the headline figure counts from the first visit's
 * value to the latest, the bar refills, four review dots light in turn and the
 * tools the profile uses arrive one by one. Nothing loops except the figure's
 * gentle pulse, and under reduced motion it simply shows where it ends.
 *
 * Every figure is the sample's own headline (`meter` is unit-tested against
 * it) and the sample is labelled as one on the card. The wording says what a
 * profile shows, never what treatment will achieve.
 */
export default function RecoveryStory({
  profile,
  compact = false,
}: {
  profile: ShowcaseProfile;
  /** Smaller type and no "what it watches" list, for the home band. */
  compact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.45 });
  const reduce = useHydrationSafeReducedMotion();
  const { meter } = profile;
  const [value, setValue] = useState(meter.from);
  const [phase, setPhase] = useState<"sore" | "better">("sore");
  const [reviews, setReviews] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      // The end state at once, with nothing moving.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(meter.to);
      setPhase("better");
      setReviews(4);
      return;
    }
    const timers: number[] = [];
    // A beat on the sore figure first, so "before" is seen before it changes.
    timers.push(
      window.setTimeout(() => {
        setPhase("better");
        const controls = animate(meter.from, meter.to, {
          duration: 1.8,
          ease: [0.16, 1, 0.3, 1],
          onUpdate: (v) => setValue(v),
        });
        timers.push(window.setTimeout(() => controls.stop(), 2000));
      }, 900)
    );
    for (let i = 1; i <= 4; i++) {
      timers.push(window.setTimeout(() => setReviews(i), 900 + i * 420));
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [inView, reduce, meter.from, meter.to]);

  const pct = (v: number) => Math.max(4, Math.min(100, (v / meter.max) * 100));
  const better = phase === "better";

  return (
    <div
      ref={ref}
      className="grid items-center gap-5 sm:grid-cols-[8.5rem_1fr] sm:gap-7"
      data-testid="recovery-story"
    >
      <div className="relative mx-auto w-28 sm:w-full">
        <BodyFocus area={profile.area} state={phase} reduceMotion={reduce} className="h-auto w-full" />
        <motion.span
          initial={false}
          animate={{ backgroundColor: better ? "#ccfbf1" : "#ffe4e6", color: better ? "#115e59" : "#9f1239" }}
          transition={{ duration: reduce ? 0 : 0.6 }}
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold"
        >
          {better ? "Latest review" : "First visit"}
        </motion.span>
      </div>

      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
          {profile.sample.name} · {profile.headline.metric}
        </p>
        <p
          className={`font-display mt-1 font-extrabold leading-none tabular-nums ${
            compact ? "text-4xl" : "text-5xl"
          }`}
          aria-label={`${profile.headline.metric}: ${profile.headline.from} at the first visit, ${profile.headline.to} at the latest review`}
        >
          <motion.span
            initial={false}
            animate={{ color: better ? "#0f766e" : "#be123c" }}
            transition={{ duration: reduce ? 0 : 0.8 }}
          >
            {formatMeterValue(meter, value)}
          </motion.span>
          <span className="ml-2 align-middle text-base font-semibold text-slate-500">
            from {profile.headline.from}
          </span>
        </p>

        {/* The bar: where the figure sits on its scale, rose while sore and
            teal once better. A lower-is-better scale (pain) shrinks. */}
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <motion.div
            className="h-full rounded-full"
            initial={false}
            animate={{
              width: `${pct(value)}%`,
              backgroundColor: better ? "#14b8a6" : "#fb7185",
            }}
            transition={{ duration: reduce ? 0 : 0.25, ease: "linear" }}
          />
        </div>

        {/* Four reviews, lighting in turn: the profile is updated at each. */}
        <div className="mt-3 flex items-center gap-2" aria-hidden="true">
          {[1, 2, 3, 4].map((i) => (
            <motion.span
              key={i}
              initial={false}
              animate={{
                scale: reviews >= i ? 1 : 0.7,
                backgroundColor: reviews >= i ? "#14b8a6" : "#e2e8f0",
              }}
              transition={{ duration: reduce ? 0 : 0.3 }}
              className="h-2.5 w-2.5 rounded-full"
            />
          ))}
          <span className="ml-1 text-xs font-medium text-slate-500">Updated at every review</span>
        </div>

        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Tools this profile uses">
          {profile.tools.map((t, i) => (
            <motion.li
              key={t.label}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={inView || reduce ? { opacity: 1, y: 0 } : undefined}
              transition={{ delay: reduce ? 0 : 1.1 + i * 0.15, duration: 0.35 }}
              className="inline-flex items-center gap-1.5 rounded-full border border-teal-100 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-900"
            >
              <i className={`fa-solid ${t.icon} text-teal-600`} aria-hidden="true" />
              {t.label}
            </motion.li>
          ))}
        </ul>

        {!compact && (
          <ul className="mt-4 space-y-1.5 text-sm text-slate-700">
            {profile.watches.map((w) => (
              <li key={w} className="flex gap-2">
                <i className="fa-solid fa-check mt-1 text-xs text-teal-600" aria-hidden="true" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 inline-block rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900">
          {SAMPLE_NOTE}
        </p>
      </div>
    </div>
  );
}
