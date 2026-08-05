"use client";

import { useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "motion/react";
import { BookingScene, FindingsScene, PlanScene } from "./scenes";

const STEPS = [
  {
    num: 1,
    tag: "Before the session",
    title: "Book a slot and send your history ahead",
    body: "Pick a time shown in your own timezone, pay in ₹ over UPI, and upload your X-rays or MRI reports so your therapist has read them before you ever join the call.",
    points: [
      "Slots auto-converted to your local time",
      "Instant, secure UPI payment",
      "X-ray / MRI upload reviewed in advance",
    ],
    scene: BookingScene,
  },
  {
    num: 2,
    tag: "The 60-minute session",
    title: "A licensed therapist measures how you actually move",
    body: "Not a phone consult. Over HD video you are guided through range-of-motion tests, posture screens and pain-response checks — measured against your own body, in the room where the pain happens.",
    points: [
      "Guided range-of-motion testing",
      "Posture and gait analysis on camera",
      "Live pain-response assessment",
    ],
    scene: FindingsScene,
  },
  {
    num: 3,
    tag: "After the session",
    title: "You leave with a plan built for your room",
    body: "Video-guided exercises prescribed around the chair, bed and floor space you actually have — reviewed and progressed at every follow-up, not handed over once and forgotten.",
    points: [
      "Video-guided daily exercises",
      "Fitted to your home setup",
      "Progressed at every follow-up",
    ],
    scene: PlanScene,
  },
] as const;

export default function StepScroller() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start center", "end center"],
  });

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const next = Math.min(STEPS.length - 1, Math.max(0, Math.floor(p * STEPS.length)));
    setActive((prev) => (prev === next ? prev : next));
  });

  const railScale = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const ActiveScene = STEPS[active].scene;

  return (
    <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="grid gap-10 md:grid-cols-2 md:gap-14">
        {/* Sticky demonstration panel — desktop only; on narrow screens each
            scene is rendered inline with its own step instead. */}
        <div className="hidden md:block">
          {/* Centred in the viewport so the panel lines up with whichever
              step block is currently centred beside it. */}
          <div className="sticky top-0 flex h-screen items-center">
            <div className="h-[27rem] w-full">
              {/* Keyed directly so each scene's own motion root handles the
                  exit transition — a plain wrapper div would swallow it. */}
              <AnimatePresence mode="wait">
                <ActiveScene key={active} />
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="relative">
          {/* Progress rail tying the three steps into one continuous path. */}
          <div className="absolute left-[19px] top-4 hidden h-[calc(100%-6rem)] w-px bg-slate-200 sm:block">
            <motion.div
              className="h-full w-full origin-top bg-gradient-to-b from-teal-500 to-emerald-500"
              style={{ scaleY: railScale }}
            />
          </div>

          {STEPS.map((step) => {
            const Scene = step.scene;
            return (
              <section
                key={step.num}
                className="relative flex min-h-[52vh] flex-col justify-center py-8 md:min-h-[78vh]"
              >
                <div className="sm:pl-14">
                  <span className="absolute left-0 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-teal-700 font-display text-sm font-bold text-white shadow-lg sm:flex">
                    {step.num}
                  </span>
                  <motion.div
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">
                      {step.tag}
                    </p>
                    <h2 className="font-display mt-2 text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">
                      {step.title}
                    </h2>
                    <p className="mt-4 text-base leading-relaxed text-slate-600">
                      {step.body}
                    </p>
                    <ul className="mt-5 space-y-2">
                      {step.points.map((p) => (
                        <li key={p} className="flex items-start gap-2.5 text-sm text-slate-700">
                          <i className="fa-solid fa-circle-check mt-0.5 text-teal-600" />
                          {p}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-8 h-[26rem] md:hidden">
                      <Scene />
                    </div>
                  </motion.div>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
