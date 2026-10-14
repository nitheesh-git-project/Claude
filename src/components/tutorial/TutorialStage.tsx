"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import OverlayPortal from "@/components/system/OverlayPortal";
import { useDialogChrome } from "@/lib/useDialogChrome";
import { tutorialStepCount, type TutorialChapter, type TutorialRole } from "@/lib/tutorial";
import TutorialSceneView from "./TutorialScenes";
import { EASE, SPRING } from "./scenePrimitives";

type Position = { chapter: number; step: number };

/**
 * The tutorial itself: a full-screen layer over the dashboard, chapter chips
 * along the top, an animated scene of dummy data on one side and the words
 * on the other. Next/Back, the arrow keys or a chapter chip move through it.
 *
 * A first run ends on Done, which fades the layer away to reveal the real
 * dashboard underneath; closing early asks once ("Skip the tour?") because
 * it cannot be got back on its own. A replay from an (i) is one chapter and
 * closes without asking.
 */
export default function TutorialStage({
  role,
  chapters,
  firstRun,
  single,
  startStep,
  onClose,
  onOpenFull,
}: {
  role: TutorialRole;
  chapters: TutorialChapter[];
  firstRun: boolean;
  single: boolean;
  /** A step id to open on, in the first chapter; unknown ids are ignored. */
  startStep?: string;
  onClose: () => void;
  onOpenFull: () => void;
}) {
  const titleId = useId();
  const [pos, setPos] = useState<Position>(() => ({
    chapter: 0,
    step: Math.max(0, chapters[0].steps.findIndex((s) => s.id === startStep)),
  }));
  const [direction, setDirection] = useState(1);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLElement>(null);

  const flat = useMemo(
    () => chapters.flatMap((c, ci) => c.steps.map((_, si) => ({ chapter: ci, step: si }))),
    [chapters]
  );
  const index = flat.findIndex((p) => p.chapter === pos.chapter && p.step === pos.step);
  const total = tutorialStepCount(chapters);
  const isLast = index === total - 1;
  const chapter = chapters[pos.chapter];
  const step = chapter.steps[pos.step];

  const go = useCallback(
    (to: number) => {
      if (to < 0 || to >= flat.length) return;
      setDirection(to > index ? 1 : -1);
      setPos(flat[to]);
    },
    [flat, index]
  );

  const requestClose = useCallback(() => {
    if (firstRun && !isLast) setConfirmSkip(true);
    else onClose();
  }, [firstRun, isLast, onClose]);

  const { panelRef, dialogProps } = useDialogChrome({ onClose: requestClose, labelledBy: titleId });

  // Each step starts at its top -- on a phone the scene sits above the
  // words, and a step that opened scrolled to the bottom hid it -- and the
  // current chapter's chip is kept in view as the row scrolls.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    // Again once the new scene has swapped in, since its height differs.
    const id = window.setTimeout(() => bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 500);
    const chip = chipsRef.current?.querySelector<HTMLElement>('[aria-current="step"]');
    chip?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    return () => window.clearTimeout(id);
  }, [pos]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (confirmSkip) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (isLast) onClose();
        else go(index + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(index - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, isLast, onClose, confirmSkip]);

  const doneLabel = single ? "Got it" : firstRun ? "Done - show my dashboard" : "Done";

  return (
    <OverlayPortal>
      <MotionConfig reducedMotion="user">
        <motion.div
          className="fixed inset-0 z-[9990] flex items-end justify-center bg-slate-900/55 backdrop-blur-sm sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.45, delay: 0.1 } }}
          data-testid="tutorial"
        >
          <motion.div
            ref={panelRef}
            {...dialogProps}
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 1.04, y: -10, transition: { duration: 0.4, ease: EASE } }}
            transition={{ ...SPRING, stiffness: 260 }}
            className="relative flex max-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-3xl"
          >
            {/* Header: what this is, where you are, the way out. */}
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 sm:px-6">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white">
                <i className="fa-solid fa-compass text-sm" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-700">
                  {single ? "Quick guide" : "Dashboard tour"} · dummy data
                </p>
                <p className="text-xs text-slate-500" aria-live="polite">
                  Step {index + 1} of {total}
                </p>
              </div>
              <button
                type="button"
                onClick={requestClose}
                aria-label={firstRun ? "Skip the tour" : "Close the tour"}
                className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                {firstRun ? "Skip" : <i className="fa-solid fa-xmark text-base" aria-hidden="true" />}
              </button>
            </div>

            {/* Chapter chips. */}
            {chapters.length > 1 && (
              <nav ref={chipsRef} aria-label="Tour chapters" className="flex gap-1.5 overflow-x-auto border-b border-slate-100 px-4 py-2 sm:px-6 [scrollbar-width:none]">
                {chapters.map((c, ci) => {
                  const active = ci === pos.chapter;
                  const done = ci < pos.chapter;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => go(flat.findIndex((p) => p.chapter === ci))}
                      aria-current={active ? "step" : undefined}
                      className={`relative flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                        active ? "text-white" : done ? "text-teal-700 hover:bg-teal-50" : "text-slate-500 hover:bg-slate-100"
                      }`}
                    >
                      {active && (
                        <motion.span layoutId="tutorial-chapter-pill" className="absolute inset-0 rounded-full bg-teal-700" transition={SPRING} />
                      )}
                      <i className={`fa-solid ${done ? "fa-circle-check" : c.icon} relative text-[10px]`} aria-hidden="true" />
                      <span className="relative">{c.title}</span>
                    </button>
                  );
                })}
              </nav>
            )}

            {/* Scene and words. */}
            <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto [overflow-anchor:none] lg:grid lg:grid-cols-[1.25fr_1fr]">
              <div className="relative flex min-h-[260px] shrink-0 items-center justify-center overflow-clip bg-gradient-to-br from-teal-50 via-slate-50 to-sky-50 p-4 sm:min-h-[340px] sm:p-8">
                <motion.div
                  aria-hidden="true"
                  className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-teal-200/40 blur-3xl"
                  animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
                  transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                  aria-hidden="true"
                  className="pointer-events-none absolute -bottom-20 -right-10 h-60 w-60 rounded-full bg-sky-200/40 blur-3xl"
                  animate={{ x: [0, -24, 0], y: [0, -16, 0] }}
                  transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
                />
                <AnimatePresence mode="wait" custom={direction}>
                  <motion.div
                    key={`${chapter.id}-${step.id}`}
                    custom={direction}
                    initial={{ opacity: 0, x: 40 * direction, scale: 0.97 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -40 * direction, scale: 0.97 }}
                    transition={{ duration: 0.45, ease: EASE }}
                    className="relative flex w-full max-w-[520px] justify-center"
                    data-testid="tutorial-scene"
                    data-scene={step.scene}
                  >
                    <TutorialSceneView scene={step.scene} role={role} stepId={step.id} />
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="flex shrink-0 flex-col justify-center p-5 sm:p-8">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${chapter.id}-${step.id}-text`}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.4, ease: EASE }}
                  >
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">
                      <i className={`fa-solid ${chapter.icon}`} aria-hidden="true" />
                      {chapter.title}
                    </p>
                    <h2 id={titleId} className="mt-2 font-display text-xl font-bold leading-tight text-slate-900 sm:text-2xl">
                      {step.title}
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-slate-600">{step.body}</p>
                    {step.points && (
                      <ul className="mt-4 space-y-2">
                        {step.points.map((point, i) => (
                          <motion.li
                            key={point}
                            initial={{ opacity: 0, x: 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ ...SPRING, delay: 0.25 + i * 0.12 }}
                            className="flex gap-2 text-[13px] leading-snug text-slate-700"
                          >
                            <i className="fa-solid fa-circle-check mt-0.5 text-teal-600" aria-hidden="true" />
                            <span>{point}</span>
                          </motion.li>
                        ))}
                      </ul>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* Progress and controls. */}
            <div className="border-t border-slate-100 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-4">
              <div className="mb-3 h-1 overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-teal-500 to-teal-700"
                  initial={false}
                  animate={{ width: `${((index + 1) / total) * 100}%` }}
                  transition={{ duration: 0.5, ease: EASE }}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => go(index - 1)}
                    disabled={index === 0}
                    className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <i className="fa-solid fa-arrow-left text-xs" aria-hidden="true" />
                    Back
                  </button>
                  {single && (
                    <button type="button" onClick={onOpenFull} className="hidden h-10 rounded-xl px-3 text-xs font-semibold text-teal-700 transition hover:bg-teal-50 sm:block">
                      Take the full tour
                    </button>
                  )}
                </div>
                <motion.button
                  type="button"
                  layout
                  onClick={() => (isLast ? onClose() : go(index + 1))}
                  whileTap={{ scale: 0.96 }}
                  className="flex h-11 items-center gap-2 rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white shadow-lg shadow-teal-700/20 transition-colors hover:bg-teal-800"
                  autoFocus
                >
                  {isLast ? doneLabel : "Next"}
                  <i className={`fa-solid ${isLast ? "fa-check" : "fa-arrow-right"} text-xs`} aria-hidden="true" />
                </motion.button>
              </div>
            </div>

            {/* Skip confirmation, inside the dialog rather than a second one. */}
            <AnimatePresence>
              {confirmSkip && (
                <motion.div
                  className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 p-6 backdrop-blur-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <motion.div
                    role="alertdialog"
                    aria-label="Skip the tour?"
                    initial={{ scale: 0.92, y: 10 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    transition={SPRING}
                    className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-xl"
                  >
                    <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                      <i className="fa-solid fa-circle-info text-lg" aria-hidden="true" />
                    </span>
                    <p className="mt-3 font-display text-base font-bold text-slate-900">Skip the tour?</p>
                    <p className="mt-1 text-sm text-slate-600">
                      You can replay any part of it later from the <i className="fa-solid fa-circle-info text-teal-700" aria-label="info" /> button beside each page title.
                    </p>
                    <div className="mt-4 flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmSkip(false)}
                        className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
                        autoFocus
                      >
                        Keep going
                      </button>
                      <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200">
                        Skip tour
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </MotionConfig>
    </OverlayPortal>
  );
}
