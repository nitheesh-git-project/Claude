"use client";

import Link from "next/link";
import { motion } from "motion/react";
import CareIllustration, { type CareIllustrationId } from "@/components/visuals/CareIllustration";

/**
 * The breadth-of-care grid.
 *
 * Its job is credibility: showing that the practice covers more than one
 * complaint, and that each area has a defined approach rather than a
 * generic promise. Every card is a link into booking, so browsing this
 * section always has somewhere to go.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

type Area = {
  id: CareIllustrationId;
  title: string;
  body: string;
  tag: string;
};

const AREAS: Area[] = [
  {
    id: "neckback",
    title: "Neck & back pain",
    body: "The most common reason patients reach us — cervical and lumbar pain assessed against your own posture, then loaded progressively.",
    tag: "Most booked",
  },
  {
    id: "posture",
    title: "Daily posture assessment",
    body: "A plumb-line screen of how you sit, stand and carry load through the day, with the specific deviations driving your symptoms identified.",
    tag: "Screening",
  },
  {
    id: "ergonomics",
    title: "Workplace ergonomics",
    body: "Your desk, chair and monitor reviewed live over video — because the setup causing the problem is the one you're sitting at right now.",
    tag: "Desk workers",
  },
  {
    id: "parkinsons",
    title: "Parkinson's rehabilitation",
    body: "Gait, balance and cueing-based movement work delivered as a structured home programme, with carers included in the session where helpful.",
    tag: "Neurological",
  },
  {
    id: "sports",
    title: "Sports rehabilitation",
    body: "Return-to-sport progressions for runners, gym-goers and recreational athletes, built around graded load rather than rest alone.",
    tag: "Return to sport",
  },
  {
    id: "mobility",
    title: "Mobility improvement",
    body: "Range-of-motion restoration after stiffness, immobilisation or surgery, tracked measurement by measurement across sessions.",
    tag: "Range of motion",
  },
  {
    id: "preventive",
    title: "Preventive physiotherapy",
    body: "For people with no current injury who want to stay ahead of one — screening, load education and a maintenance routine.",
    tag: "Stay ahead",
  },
];

export default function CareAreas() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {AREAS.map((area, i) => (
        <motion.div
          key={area.id}
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, delay: Math.min(i * 0.06, 0.3), ease: EASE }}
          className="h-full"
        >
          <Link
            href="/book"
            className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-teal-300 hover:shadow-xl hover:shadow-slate-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="h-20 w-24 shrink-0 rounded-xl bg-teal-50/70 p-2 transition-colors group-hover:bg-teal-50">
                <CareIllustration id={area.id} className="h-full w-full text-teal-700" />
              </div>
              <span className="shrink-0 rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {area.tag}
              </span>
            </div>
            <h3 className="font-display mt-5 text-lg font-bold text-slate-900">{area.title}</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{area.body}</p>
            <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700">
              Book an assessment
              <i
                aria-hidden="true"
                className="fa-solid fa-arrow-right text-[10px] transition-transform group-hover:translate-x-1"
              />
            </span>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
