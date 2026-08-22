"use client";

import { useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "motion/react";
import { BookingScene, ChartScene, IntakeScene, SessionScene } from "./scenes";

const STEPS = [
  {
    num: 1,
    tag: "Booking",
    title: "Pick how you want to be seen, and when",
    body: "A video consultation or a home visit at your address — the same therapists, the same hour, chosen at the first step. Slots are shown in your own timezone and only include times a therapist is genuinely free.",
    points: [
      "Video call or home visit, your choice",
      "Times converted to your own timezone",
      "Pay by UPI, card or netbanking",
    ],
    scene: BookingScene,
  },
  {
    num: 2,
    tag: "Before the session",
    title: "Answer seven questions and attach your reports",
    body: "One question at a time, about two minutes, each one explaining why it is being asked. Add the X-rays, MRI reports, blood tests and prescriptions other doctors have given you — your therapist reads all of it before the session starts.",
    points: [
      "Seven short questions, not a form",
      "Upload reports as PDFs or photos",
      "Read by your therapist in advance",
    ],
    scene: IntakeScene,
  },
  {
    num: 3,
    tag: "The session",
    title: "An hour with a licensed therapist",
    body: "Sixty minutes on Google Meet — the join button appears on your dashboard shortly before the time — or at your own address if you booked a home visit. Guided movement checks, area by area, in the language you picked when booking.",
    points: [
      "60 minutes, on Google Meet or at home",
      "Nothing to install beyond a browser",
      "Conducted in your chosen language",
    ],
    scene: SessionScene,
  },
  {
    num: 4,
    tag: "After the session",
    title: "Your chart updates, and it stays yours",
    body: "Your therapist records what they found on a body map — each area examined, rated out of ten — and it lands on your health profile the same day. Come back for the next session and the chart shows whether those numbers are moving.",
    points: [
      "Every area examined, worst first",
      "A pain trend across your sessions",
      "Download the whole record as a PDF",
    ],
    scene: ChartScene,
  },
] as const;

// Online-only wording for the two steps that mention the other mode.
// Rewriting them here rather than at the call site keeps one list of steps
// -- two parallel arrays would be two things to keep in step.
const ONLINE_ONLY_COPY: Record<number, { title?: string; body: string; points: string[] }> = {
  1: {
    title: "Pick a time that suits you",
    body: "Slots are shown in your own timezone and only include times a therapist is genuinely free — at least 12 hours ahead, so your therapist can prepare.",
    points: [
      "Times converted to your own timezone",
      "Only slots a therapist is free for",
      "Pay by UPI, card or netbanking",
    ],
  },
  3: {
    body: "Sixty minutes on Google Meet — the join button appears on your dashboard shortly before the time. Guided movement checks, area by area, in the language you picked when booking.",
    points: [
      "60 minutes, on Google Meet",
      "Nothing to install beyond a browser",
      "Conducted in your chosen language",
    ],
  },
};

type Step = {
  num: number;
  tag: string;
  title: string;
  body: string;
  points: readonly string[];
  scene: (typeof STEPS)[number]["scene"];
};

function withoutHomeVisit(step: (typeof STEPS)[number]): Step {
  const override = ONLINE_ONLY_COPY[step.num];
  return override ? { ...step, ...override, title: override.title ?? step.title } : step;
}

export default function StepScroller({ homeVisitEnabled }: { homeVisitEnabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  // Steps 1 and 3 describe home visits, which are behind an admin master
  // switch -- when it is off the mode does not exist for a visitor, and
  // /book-home-visit 404s, so the copy must not offer it.
  const steps = homeVisitEnabled ? STEPS : STEPS.map(withoutHomeVisit);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start center", "end center"],
  });

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const next = Math.min(steps.length - 1, Math.max(0, Math.floor(p * steps.length)));
    setActive((prev) => (prev === next ? prev : next));
  });

  const railScale = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const ActiveScene = steps[active].scene;

  return (
    <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="grid gap-10 md:grid-cols-2 md:gap-14">
        {/* Sticky demonstration panel — desktop only; on narrow screens each
            scene is rendered inline with its own step instead. */}
        <div className="hidden md:block">
          {/* Centred in the viewport so the panel lines up with whichever
              step block is currently centred beside it. */}
          <div className="sticky top-0 flex h-screen items-center">
            <div className="h-[35rem] w-full">
              {/* Keyed directly so each scene's own motion root handles the
                  exit transition — a plain wrapper div would swallow it. */}
              <AnimatePresence mode="wait">
                <ActiveScene key={active} homeVisitEnabled={homeVisitEnabled} />
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

          {steps.map((step) => {
            const Scene = step.scene;
            return (
              <section
                key={step.num}
                className="relative flex flex-col justify-center py-8 md:min-h-[60vh]"
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

                    <div className="mt-8 h-[34rem] md:hidden">
                      <Scene homeVisitEnabled={homeVisitEnabled} />
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
