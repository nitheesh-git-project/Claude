"use client";

import { useRef } from "react";
import Image from "next/image";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import spineImage from "../../../public/spine.jpg";

/**
 * The home page's "what we actually treat" act.
 *
 * A real lateral radiograph is held sticky while the visitor scrolls, and a
 * spotlight travels down it — dimming the rest of the column so the region
 * under discussion is the only part fully lit. Each region brings up the
 * complaints treated there.
 *
 * The spotlight is built from two scrims that are translated rather than
 * resized, so it animates on the compositor (no layout work per frame) and
 * the feathered edges keep a constant softness instead of stretching.
 */

/**
 * Region centres as a fraction of the image's height, measured against the
 * supplied radiograph: the cervical curve sits high and short, the thoracic
 * run is long, and the lumbar bodies sit just above the sacrum.
 */
const REGIONS = [
  {
    id: "cervical",
    tag: "Cervical spine",
    centre: 0.12,
    title: "Neck, shoulders & headaches",
    body: "Desk-bound necks, stiffness that spreads into the shoulders, and headaches that trace back to cervical posture.",
    assessed:
      "Assessed by guided range-of-motion tests on camera — we watch how far you turn, and where the movement stops.",
    complaints: ["Neck stiffness", "Tech-neck posture", "Shoulder tension"],
  },
  {
    id: "thoracic",
    tag: "Thoracic spine",
    centre: 0.4,
    title: "Mid-back & postural fatigue",
    body: "Rounded shoulders and mid-back tightness built up over long hours seated — the pattern behind most desk-work pain.",
    assessed:
      "Assessed from your everyday setup: we review your seated posture at your own desk, in your own chair.",
    complaints: ["Rounded shoulders", "Mid-back tightness", "Postural fatigue"],
  },
  {
    id: "lumbar",
    tag: "Lumbar spine",
    centre: 0.68,
    title: "Lower back & post-surgical recovery",
    body: "Lower-back pain, referred leg symptoms, and structured rehabilitation after spinal or joint surgery.",
    assessed:
      "Assessed through loaded movement screens — sit-to-stand, bending, and walking patterns reviewed live.",
    complaints: ["Low back pain", "Referred leg pain", "Post-op rehab"],
  },
] as const;

/** Half-height of the lit band, as a fraction of the image. */
const BAND = 0.12;

function RegionPanel({
  region,
  index,
  progress,
}: {
  region: (typeof REGIONS)[number];
  index: number;
  progress: MotionValue<number>;
}) {
  const centre = (index + 0.5) / REGIONS.length;
  const span = 0.5 / REGIONS.length;

  const opacity = useTransform(
    progress,
    [centre - span * 1.5, centre - span * 0.55, centre + span * 0.55, centre + span * 1.5],
    [0, 1, 1, 0]
  );
  const y = useTransform(progress, [centre - span * 1.5, centre + span * 1.5], [40, -40]);

  return (
    <motion.div style={{ opacity, y }} className="absolute inset-x-0 top-0">
      <span className="inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-teal-300">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-teal-400" />
        {region.tag}
      </span>
      <h3 className="font-display mt-4 text-3xl font-bold leading-tight text-white sm:text-4xl">
        {region.title}
      </h3>
      <p className="mt-4 max-w-md text-base leading-relaxed text-slate-300">{region.body}</p>
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

function RailMarker({ index, progress }: { index: number; progress: MotionValue<number> }) {
  const centre = (index + 0.5) / REGIONS.length;
  const span = 0.5 / REGIONS.length;
  const scale = useTransform(progress, [centre - span, centre, centre + span], [1, 1.35, 1]);
  const opacity = useTransform(
    progress,
    [centre - span * 1.4, centre, centre + span * 1.4],
    [0.28, 1, 0.28]
  );
  return (
    // Scales from the left edge so the active label can't overflow the
    // viewport on narrow screens.
    <motion.div
      style={{ scale, opacity, transformOrigin: "left center" }}
      className="flex items-center gap-3"
    >
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-teal-400" />
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

  // Smoothing keeps the spotlight from jittering on trackpads and phone flings.
  const progress = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 26,
    restDelta: 0.001,
  });

  // Spotlight centre travels from the cervical region down to the lumbar.
  const centre = useTransform(
    progress,
    [0, 1],
    [REGIONS[0].centre, REGIONS[REGIONS.length - 1].centre]
  );

  const topShift = useTransform(centre, (c) => `${(Math.max(0, c - BAND) - 1) * 100}%`);
  const bottomShift = useTransform(centre, (c) => `${Math.min(1, c + BAND) * 100}%`);

  return (
    <section ref={ref} className="relative h-[250vh] bg-slate-950">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
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
                <RegionPanel key={region.id} region={region} index={i} progress={progress} />
              ))}
            </div>
            <div className="mt-2 flex flex-col gap-3">
              {REGIONS.map((_, i) => (
                <RailMarker key={i} index={i} progress={progress} />
              ))}
            </div>
          </div>

          <div className="pointer-events-none absolute inset-y-0 right-0 -z-0 flex w-2/3 items-center justify-center opacity-30 md:relative md:z-10 md:w-full md:opacity-100">
            <div className="relative h-[82vh] aspect-[1200/2381] overflow-hidden">
              <Image
                src={spineImage}
                alt="Lateral radiograph of the human spinal column, from the cervical vertebrae down to the sacrum."
                placeholder="blur"
                sizes="(max-width: 768px) 60vw, 22rem"
                className="h-full w-full object-contain"
              />

              {/* Spotlight scrims — everything outside the lit band is dimmed. */}
              <motion.div
                aria-hidden="true"
                style={{
                  y: topShift,
                  backgroundImage:
                    "linear-gradient(to bottom, rgba(2,6,23,0.9) 0%, rgba(2,6,23,0.9) 90%, rgba(2,6,23,0) 100%)",
                }}
                className="absolute inset-0"
              />
              <motion.div
                aria-hidden="true"
                style={{
                  y: bottomShift,
                  backgroundImage:
                    "linear-gradient(to top, rgba(2,6,23,0.9) 0%, rgba(2,6,23,0.9) 90%, rgba(2,6,23,0) 100%)",
                }}
                className="absolute inset-0"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
