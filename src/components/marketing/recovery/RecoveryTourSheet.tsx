"use client";

import { useId } from "react";
import { motion } from "motion/react";
import Link from "@/components/system/ProgressLink";
import OverlayPortal from "@/components/system/OverlayPortal";
import { useDialogChrome } from "@/lib/useDialogChrome";
import { useHydrationSafeReducedMotion } from "@/lib/useHydrationSafeReducedMotion";
import type { ShowcaseProfile } from "@/lib/healthProfileShowcase";
import RecoveryStory from "./RecoveryStory";

/**
 * "See the full health profile": every kind of care the clinic offers, each
 * as its own short recovery story, then what it takes to have one's own.
 *
 * A sheet rather than a page, so the home page keeps its place behind it and
 * a visitor is one swipe from where they were. Each story plays as it scrolls
 * into view. The last card is the unlock: a visitor's own profile opens with
 * their first booking, and the real screens are on /how-it-works.
 */
export default function RecoveryTourSheet({
  profiles,
  onClose,
}: {
  profiles: ShowcaseProfile[];
  onClose: () => void;
}) {
  const titleId = useId();
  const reduce = useHydrationSafeReducedMotion();
  const { panelRef, dialogProps } = useDialogChrome({ onClose, labelledBy: titleId });

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
        <motion.div
          ref={panelRef}
          {...dialogProps}
          initial={reduce ? false : { y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
          data-testid="recovery-tour"
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-7">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Your health profile</p>
              <h2 id={titleId} className="font-display mt-1 text-2xl font-bold text-slate-900">
                From sore to better, measured
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            >
              <i className="fa-solid fa-xmark text-lg" aria-hidden="true" />
            </button>
          </div>

          <div className="overflow-y-auto overscroll-contain px-5 py-6 sm:px-7">
            <ol className="space-y-6">
              {profiles.map((p) => (
                <li key={p.specialty} className="rounded-2xl border border-slate-200 p-5 sm:p-6">
                  <div className="mb-5 flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                      <i className={`fa-solid ${p.icon}`} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-display text-lg font-bold leading-tight text-slate-900">{p.label}</h3>
                      <p className="mt-0.5 text-sm text-slate-600">{p.forWho}</p>
                    </div>
                  </div>
                  <RecoveryStory profile={p} />
                </li>
              ))}
            </ol>

            {/* The unlock. A visitor sees samples; their own profile is made
                with their physiotherapist, so it starts with a booking. */}
            <div className="mt-6 rounded-2xl bg-gradient-to-br from-teal-700 to-emerald-600 p-6 text-white" data-testid="recovery-unlock">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <i className="fa-solid fa-lock-open" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-display text-xl font-bold">Unlock your own</p>
                  <p className="mt-1 text-sm text-teal-50">
                    Your profile opens with your first booking, and fills in at every review.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/book"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-5 font-bold text-teal-800 shadow-sm hover:bg-teal-50"
                >
                  Book a video session
                  <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
                </Link>
                <Link
                  href="/how-it-works#health-profile"
                  className="inline-flex min-h-11 items-center rounded-xl border border-white/40 px-5 font-semibold text-white hover:bg-white/10"
                >
                  See the real screens
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </OverlayPortal>
  );
}
