"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import CareIllustration, { type CareIllustrationId } from "@/components/visuals/CareIllustration";

/**
 * Booking → recovery, as an interactive three-step selector.
 *
 * Selecting a step swaps the detail panel rather than navigating away, so
 * the whole journey can be understood without leaving the page. Steps are
 * real buttons in a tablist so keyboard and screen-reader users get the
 * same behaviour as pointer users.
 *
 * It also advances on its own, 01 -> 02 -> 03 -> 01, so a visitor who never
 * touches it still sees all three. The pace is an admin setting
 * (Settings -> Public Site), since the right one depends on how much copy
 * the steps carry -- which admins also edit. Three things keep the rotation
 * from being user-hostile:
 *
 * - Pointer or keyboard inside the component pauses it. Content that moves
 *   while someone is reading it is worse than content they never saw.
 * - Choosing a step restarts the clock rather than leaving whatever was left
 *   of the current tick, so a deliberate choice is never cut short.
 * - Under prefers-reduced-motion it does not advance at all. An unbidden
 *   rotation is exactly the motion that setting exists to stop; the tabs
 *   still work by hand.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Used when no admin setting reaches this component -- a caller that
 * doesn't pass one, or a database without the journey_step_seconds column
 * yet. Must stay equal to DEFAULT_ADMIN_SETTINGS.journeyStepSeconds.
 */
const DEFAULT_STEP_SECONDS = 4;

type Step = {
  id: string;
  num: string;
  title: string;
  short: string;
  detail: string;
  bullets: string[];
  illustration: CareIllustrationId;
};

const STEPS: Step[] = [
  {
    id: "book",
    num: "01",
    title: "Book in your timezone",
    short: "Pick a slot, pay, send your scans",
    detail:
      "Slots are converted to your own timezone before you ever see them. Pay in ₹ over UPI and upload X-rays or MRI reports, which your therapist reads before the session starts.",
    bullets: [
      "Times shown in your local timezone",
      "Instant, secure UPI payment",
      "Reports reviewed before the call",
    ],
    illustration: "booking",
  },
  {
    id: "assess",
    num: "02",
    title: "Get assessed on camera",
    short: "60 minutes with a licensed specialist",
    detail:
      "A full movement assessment over HD video — range-of-motion testing, posture screening and pain-response checks, measured in the room where your pain actually happens.",
    bullets: [
      "Guided range-of-motion testing",
      "Posture and gait screening",
      "Written findings you keep",
    ],
    illustration: "assessment",
  },
  {
    id: "recover",
    num: "03",
    title: "Rehab from your room",
    short: "A plan built for your space",
    detail:
      "Video-guided exercises prescribed around the chair, bed and floor space you actually have — then reviewed and progressed at every follow-up rather than handed over once.",
    bullets: [
      "Video-guided daily exercises",
      "Fitted to your home setup",
      "Progressed at every follow-up",
    ],
    illustration: "plan",
  },
];

export default function JourneySteps({
  variant = "full",
  stepSeconds = DEFAULT_STEP_SECONDS,
}: {
  /** "compact" stacks selector above panel, for narrow column placement. */
  variant?: "full" | "compact";
  /** Admin-configured pace. 0 means don't advance on its own. */
  stepSeconds?: number;
} = {}) {
  const [active, setActive] = useState(0);
  // Two independent reasons to hold the rotation, deliberately not one
  // shared boolean.
  //
  // They used to share `paused`, and whichever condition ended last won: the
  // panel beside the tabs is animated, so a focusable node inside it is
  // removed on every step change, which fires a blur that bubbled to the
  // capture handler and cleared the flag -- un-pausing a widget the pointer
  // was still resting on, about a second after it paused. Keeping them apart
  // means neither can answer for the other.
  const [pointerInside, setPointerInside] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const paused = pointerInside || focusInside;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const step = STEPS[active];
  const compact = variant === "compact";
  const reduceMotion = useReducedMotion();

  // Catches a pointer that was already inside when this hydrated.
  //
  // The pause below is a React synthetic handler, so it only ever hears a
  // mouseenter that happens *after* hydration. This band is server-rendered
  // near the top of the home page, so a visitor whose cursor is already
  // resting on it -- or who moved there while the JavaScript was still
  // loading -- got no enter event at all, and the widget then started
  // rotating under a stationary cursor: the one thing the pause exists to
  // prevent. :hover is the browser's own answer to "is the pointer in here
  // right now", and it is true regardless of when the pointer arrived.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (el.matches(":hover")) setPointerInside(true);
  }, []);

  useEffect(() => {
    // 0 is the admin's way of switching the rotation off entirely, so it is
    // checked here rather than clamped -- a 0ms timeout would spin.
    if (paused || reduceMotion || stepSeconds <= 0) return;
    // Keyed on `active` as well, so selecting a step resets the clock: the
    // timer is recreated on every change, whether this one made it or a
    // person did.
    const timer = setTimeout(
      () => setActive((i) => (i + 1) % STEPS.length),
      stepSeconds * 1000
    );
    return () => clearTimeout(timer);
  }, [active, paused, reduceMotion, stepSeconds]);

  return (
    <div
      ref={rootRef}
      onMouseEnter={() => setPointerInside(true)}
      // Only when the pointer genuinely left. The panel beside the tabs is
      // animated, so nodes inside it are removed on every step change, and a
      // removal under (or near) the cursor synthesizes a mouseleave on this
      // element even though nobody moved the mouse -- which un-paused the
      // widget a beat after it paused, under a stationary pointer. The
      // browser's own :hover is the authority on where the pointer is; the
      // synthesized event is not.
      onMouseLeave={(e) => {
        if (!e.currentTarget.matches(":hover")) setPointerInside(false);
      }}
      onFocusCapture={() => setFocusInside(true)}
      // Only when focus actually left this widget. A node removed by the
      // panel's own animation blurs with no relatedTarget, which is not
      // somebody looking away.
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocusInside(false);
        }
      }}
      className={
        compact
          ? "flex flex-col gap-4"
          : "grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12"
      }
    >
      {/* Selector */}
      <div
        role="tablist"
        aria-label="How the process works"
        className={compact ? "grid grid-cols-3 gap-2" : "flex flex-col gap-3"}
      >
        {STEPS.map((s, i) => {
          const selected = i === active;
          return (
            <button
              key={s.id}
              role="tab"
              id={`journey-tab-${s.id}`}
              aria-selected={selected}
              aria-controls={`journey-panel-${s.id}`}
              onClick={() => setActive(i)}
              className={`group relative cursor-pointer rounded-2xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 ${
                compact ? "p-3" : "p-5"
              } ${
                selected
                  ? "border-teal-600 bg-white shadow-lg shadow-slate-900/5"
                  : "border-slate-200 bg-white/60 hover:border-teal-300 hover:bg-white"
              }`}
            >
              {selected && !compact && (
                <motion.span
                  layoutId="journey-active-rail"
                  className="absolute inset-y-4 left-0 w-1 rounded-full bg-teal-600"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <div className={compact ? "flex flex-col gap-1" : "flex items-center gap-4"}>
                <span
                  className={`font-display font-extrabold transition-colors ${
                    compact ? "text-lg" : "text-2xl"
                  } ${
                    selected ? "text-teal-700" : "text-slate-200 group-hover:text-slate-300"
                  }`}
                >
                  {s.num}
                </span>
                <span className="min-w-0">
                  <span
                    className={`font-display block font-bold text-slate-900 ${
                      compact ? "text-xs leading-snug" : "text-base"
                    }`}
                  >
                    {s.title}
                  </span>
                  {!compact && (
                    <span className="mt-0.5 block text-xs text-slate-500">{s.short}</span>
                  )}
                </span>
                {!compact && (
                <i
                  aria-hidden="true"
                  className={`fa-solid fa-arrow-right ml-auto shrink-0 text-xs transition-all ${
                    selected ? "text-teal-600" : "-translate-x-1 text-slate-300 opacity-0 group-hover:translate-x-0 group-hover:opacity-100"
                  }`}
                />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Detail panel */}
      <div className={compact ? "relative min-h-[19rem]" : "relative min-h-[21rem]"}>
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            role="tabpanel"
            id={`journey-panel-${step.id}`}
            aria-labelledby={`journey-tab-${step.id}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35, ease: EASE }}
            className={`h-full rounded-2xl border border-slate-200 bg-white shadow-sm ${
              compact ? "p-5" : "p-7 sm:p-8"
            }`}
          >
            <div className={`flex gap-5 ${compact ? "flex-row items-start" : "flex-col sm:flex-row sm:items-start sm:gap-6"}`}>
              <div className={`shrink-0 rounded-xl bg-teal-50/70 p-3 ${compact ? "h-20 w-24" : "h-28 w-36"}`}>
                <CareIllustration id={step.illustration} className="h-full w-full text-teal-700" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700">
                  Step {step.num}
                </span>
                <h3 className={`font-display mt-1 font-bold text-slate-900 ${compact ? "text-lg" : "text-xl sm:text-2xl"}`}>
                  {step.title}
                </h3>
                <p className={`mt-2 leading-relaxed text-slate-600 ${compact ? "text-xs" : "mt-3 text-sm"}`}>
                  {step.detail}
                </p>
              </div>
            </div>

            <ul className={`grid gap-2.5 border-t border-slate-100 ${compact ? "mt-4 pt-4" : "mt-6 pt-6 sm:grid-cols-2"}`}>
              {step.bullets.map((b) => (
                <li key={b} className={`flex items-start gap-2.5 text-slate-700 ${compact ? "text-xs" : "text-sm"}`}>
                  <i aria-hidden="true" className="fa-solid fa-circle-check mt-0.5 shrink-0 text-teal-600" />
                  {b}
                </li>
              ))}
            </ul>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
