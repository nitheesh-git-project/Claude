"use client";

import { motion, useMotionValue } from "motion/react";
import XraySpine from "@/components/visuals/XraySpine";

/**
 * Hero visual: what a patient actually receives from the first session.
 *
 * Deliberately concrete rather than aspirational — no invented recovery
 * statistics or outcome claims, which on a clinical site are both an
 * ethical problem and, once a visitor senses they're unverified, a trust
 * problem. Everything listed here is something the platform genuinely
 * delivers.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

const DELIVERABLES = [
  { icon: "fa-stopwatch", label: "60-minute 1-on-1 video assessment" },
  { icon: "fa-person-walking", label: "Guided movement & posture screen" },
  { icon: "fa-file-lines", label: "Written findings you keep" },
  { icon: "fa-house-medical", label: "Exercise plan fitted to your space" },
  { icon: "fa-rotate", label: "Reviewed and progressed at follow-up" },
];

export default function HeroPanel({ priceLabel }: { priceLabel: string }) {
  // The spine is decorative here, so it sits at a fixed exposure rather
  // than tracking scroll — reusing the same component avoids a second
  // implementation drifting out of sync with the real one.
  const staticProgress = useMotionValue(0.62);

  return (
    <div className="relative">
      {/* Anatomical watermark: medical credibility without stock photography. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-4 -top-12 hidden h-[128%] w-52 opacity-[0.16] sm:block"
      >
        <XraySpine progress={staticProgress} variant="bare" className="h-full w-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="relative rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-xl shadow-slate-900/5 backdrop-blur sm:p-7"
      >
        <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white"
          >
            DP
          </span>
          <div className="min-w-0">
            <p className="font-display text-sm font-bold text-slate-900">Dr. Pooja (PT)</p>
            <p className="text-xs text-slate-500">MPT (Ortho) · Lead Specialist · 8+ years</p>
          </div>
          <span className="ml-auto shrink-0 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-bold text-teal-800">
            {priceLabel}
          </span>
        </div>

        <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-teal-700">
          What your first session includes
        </p>

        <ul className="mt-4 space-y-3">
          {DELIVERABLES.map((d, i) => (
            <motion.li
              key={d.label}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.08, duration: 0.4, ease: EASE }}
              className="flex items-center gap-3"
            >
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-xs text-teal-700"
              >
                <i className={`fa-solid ${d.icon}`} />
              </span>
              <span className="text-sm leading-snug text-slate-700">{d.label}</span>
            </motion.li>
          ))}
        </ul>

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <i aria-hidden="true" className="fa-solid fa-lock text-teal-600" />
            Secure UPI payment
          </span>
          <span className="flex items-center gap-1.5">
            <i aria-hidden="true" className="fa-solid fa-video text-teal-600" />
            Runs on Google Meet
          </span>
          <span className="flex items-center gap-1.5">
            <i aria-hidden="true" className="fa-solid fa-clock-rotate-left text-teal-600" />
            Reschedule up to 12h before
          </span>
        </div>
      </motion.div>
    </div>
  );
}
