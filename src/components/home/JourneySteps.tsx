"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import CareIllustration, { type CareIllustrationId } from "@/components/visuals/CareIllustration";

/**
 * Booking → recovery, as an interactive three-step selector.
 *
 * Selecting a step swaps the detail panel rather than navigating away, so
 * the whole journey can be understood without leaving the page. Steps are
 * real buttons in a tablist so keyboard and screen-reader users get the
 * same behaviour as pointer users.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

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

export default function JourneySteps() {
  const [active, setActive] = useState(0);
  const step = STEPS[active];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12">
      {/* Selector */}
      <div role="tablist" aria-label="How the process works" className="flex flex-col gap-3">
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
              className={`group relative cursor-pointer rounded-2xl border p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 ${
                selected
                  ? "border-teal-600 bg-white shadow-lg shadow-slate-900/5"
                  : "border-slate-200 bg-white/60 hover:border-teal-300 hover:bg-white"
              }`}
            >
              {selected && (
                <motion.span
                  layoutId="journey-active-rail"
                  className="absolute inset-y-4 left-0 w-1 rounded-full bg-teal-600"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <div className="flex items-center gap-4">
                <span
                  className={`font-display text-2xl font-extrabold transition-colors ${
                    selected ? "text-teal-700" : "text-slate-200 group-hover:text-slate-300"
                  }`}
                >
                  {s.num}
                </span>
                <span className="min-w-0">
                  <span className="font-display block text-base font-bold text-slate-900">
                    {s.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">{s.short}</span>
                </span>
                <i
                  aria-hidden="true"
                  className={`fa-solid fa-arrow-right ml-auto shrink-0 text-xs transition-all ${
                    selected ? "text-teal-600" : "-translate-x-1 text-slate-300 opacity-0 group-hover:translate-x-0 group-hover:opacity-100"
                  }`}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* Detail panel */}
      <div className="relative min-h-[21rem]">
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
            className="h-full rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-8"
          >
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="h-28 w-36 shrink-0 rounded-xl bg-teal-50/70 p-3">
                <CareIllustration id={step.illustration} className="h-full w-full text-teal-700" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700">
                  Step {step.num}
                </span>
                <h3 className="font-display mt-1 text-xl font-bold text-slate-900 sm:text-2xl">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{step.detail}</p>
              </div>
            </div>

            <ul className="mt-6 grid gap-2.5 border-t border-slate-100 pt-6 sm:grid-cols-2">
              {step.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-sm text-slate-700">
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
