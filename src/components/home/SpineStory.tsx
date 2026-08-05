"use client";

import { useRef } from "react";
import { motion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import XraySpine from "@/components/visuals/XraySpine";

/**
 * The home page's "what we actually treat" act.
 *
 * A sticky anatomical spine is scanned top-to-bottom as the visitor
 * scrolls, and each region of the column brings up the complaints treated
 * there. The goal is that someone who reads nothing still understands
 * within one scroll that this is a spine-and-movement practice.
 */

const REGIONS = [
  {
    id: "cervical",
    tag: "Cervical spine",
    title: "Neck, shoulders & headaches",
    body: "Desk-bound necks, stiffness that spreads into the shoulders, and headaches that trace back to cervical posture.",
    assessed: "Assessed by guided range-of-motion tests on camera — we watch how far you turn, and where the movement stops.",
    complaints: ["Neck stiffness", "Tech-neck posture", "Shoulder tension"],
  },
  {
    id: "thoracic",
    tag: "Thoracic spine",
    title: "Mid-back & postural fatigue",
    body: "Rounded shoulders and mid-back tightness built up over long hours seated — the pattern behind most desk-work pain.",
    assessed: "Assessed from your everyday setup: we review your seated posture at your own desk, in your own chair.",
    complaints: ["Rounded shoulders", "Mid-back tightness", "Postural fatigue"],
  },
  {
    id: "lumbar",
    tag: "Lumbar spine",
    title: "Lower back & post-surgical recovery",
    body: "Lower-back pain, referred leg symptoms, and structured rehabilitation after spinal or joint surgery.",
    assessed: "Assessed through loaded movement screens — sit-to-stand, bending, and walking patterns reviewed live.",
    complaints: ["Low back pain", "Referred leg pain", "Post-op rehab"],
  },
] as const;

function RegionPanel({
  region,
  index,
  progress,
}: {
  region: (typeof REGIONS)[number];
  index: number;
  progress: MotionValue<number>;
}) {
  const center = (index + 0.5) / REGIONS.length;
  const span = 0.5 / REGIONS.length;

  const opacity = useTransform(
    progress,
    [center - span * 1.5, center - span * 0.55, center + span * 0.55, center + span * 1.5],
    [0, 1, 1, 0]
  );
  const y = useTransform(progress, [center - span * 1.5, center + span * 1.5], [40, -40]);

  return (
    <motion.div
      style={{ opacity, y }}
      className="absolute inset-x-0 top-0"
      aria-hidden={undefined}
    >
      <span className="inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-teal-300">
        <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
        {region.tag}
      </span>
      <h3 className="font-display mt-4 text-3xl font-bold leading-tight text-white sm:text-4xl">
        {region.title}
      </h3>
      <p className="mt-4 max-w-md text-base leading-relaxed text-slate-300">
        {region.body}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {region.complaints.map((c) => (
          <span
            key={c}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-200"
          >
            {c}
          </span>
        ))}
      </div>
      <p className="mt-6 max-w-md border-l-2 border-teal-500/50 pl-4 text-sm leading-relaxed text-teal-100/80">
        {region.assessed}
      </p>
    </motion.div>
  );
}

function RailMarker({
  index,
  progress,
}: {
  index: number;
  progress: MotionValue<number>;
}) {
  const center = (index + 0.5) / REGIONS.length;
  const span = 0.5 / REGIONS.length;
  const scale = useTransform(
    progress,
    [center - span, center, center + span],
    [1, 1.35, 1]
  );
  const opacity = useTransform(
    progress,
    [center - span * 1.4, center, center + span * 1.4],
    [0.28, 1, 0.28]
  );
  return (
    <motion.div style={{ scale, opacity }} className="flex items-center gap-3">
      <span className="h-2 w-2 rounded-full bg-teal-400" />
      <span className="text-xs font-semibold uppercase tracking-widest text-teal-200">
        {REGIONS[index].tag.split(" ")[0]}
      </span>
    </motion.div>
  );
}

export default function SpineStory() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  // Smoothing keeps the scan from jittering on trackpads and phone flings.
  const progress = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 26,
    restDelta: 0.001,
  });

  return (
    <section ref={ref} className="relative h-[250vh] bg-slate-950">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        {/* Ambient depth behind the column. */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-[46rem] w-[46rem] -translate-x-1/4 -translate-y-1/2 rounded-full bg-teal-500/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
        </div>

        <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-8 px-4 sm:px-6 md:grid-cols-2 lg:px-8">
          <div className="relative z-10">
            <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-teal-400">
              What we treat
            </p>
            {/* Fixed height reserves space for the tallest panel so the
                crossfade never shifts the layout underneath it. */}
            <div className="relative mt-6 h-[26rem] sm:h-[24rem]">
              {REGIONS.map((region, i) => (
                <RegionPanel
                  key={region.id}
                  region={region}
                  index={i}
                  progress={progress}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-col gap-3">
              {REGIONS.map((_, i) => (
                <RailMarker key={i} index={i} progress={progress} />
              ))}
            </div>
          </div>

          <div className="pointer-events-none absolute inset-y-0 right-0 -z-0 flex w-2/3 items-center opacity-25 md:relative md:z-10 md:w-full md:opacity-100">
            <XraySpine progress={progress} className="mx-auto h-[82vh] w-full max-w-sm" />
          </div>
        </div>
      </div>
    </section>
  );
}
