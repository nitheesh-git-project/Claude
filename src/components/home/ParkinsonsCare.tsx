"use client";

import Link from "next/link";
import { motion } from "motion/react";
import CareIllustration from "@/components/visuals/CareIllustration";

/**
 * Parkinson's care section.
 *
 * Physiotherapy for Parkinson's is genuinely evidence-supported for
 * mobility, balance and falls — but it manages symptoms and function, it
 * does not slow or reverse the disease. The copy here is written to that
 * line deliberately: overclaiming to a newly-diagnosed reader (or their
 * family) is both a clinical-integrity problem and the fastest way to
 * lose the trust this section exists to build.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

const FOCUS_AREAS = [
  {
    icon: "fa-person-walking",
    title: "Gait correction",
    body: "Shuffling, reduced stride and freezing episodes addressed with cueing strategies and rhythm-based walking practice.",
  },
  {
    icon: "fa-scale-balanced",
    title: "Balance training",
    body: "Graded stability work that targets the postural reflexes most affected, retrained in the spaces you move through daily.",
  },
  {
    icon: "fa-shield-halved",
    title: "Fall prevention",
    body: "Turning technique, transfers and home-hazard review — because a single fall often marks the biggest step down in independence.",
  },
  {
    icon: "fa-user-check",
    title: "Posture improvement",
    body: "Counteracting the forward-stooped posture that develops over time, with extension work and positional awareness.",
  },
  {
    icon: "fa-dumbbell",
    title: "Strength & coordination",
    body: "Large-amplitude movement training to keep motions deliberate and full-range rather than small and hesitant.",
  },
  {
    icon: "fa-hands-holding-circle",
    title: "Flexibility & mobility",
    body: "Range-of-motion work against the rigidity that limits reaching, dressing, turning in bed and getting out of a chair.",
  },
];

const OUTCOMES = [
  "Moving more confidently at home",
  "Fewer stumbles and near-falls",
  "Staying independent for longer",
  "Carers included in every session",
];

export default function ParkinsonsCare() {
  return (
    <section className="relative overflow-hidden bg-white py-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 top-24 h-96 w-96 rounded-full bg-teal-100/40 blur-3xl"
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Lead */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
              <i aria-hidden="true" className="fa-solid fa-brain text-teal-600" />
              Neurological rehabilitation
            </span>
            <h2 className="font-display mt-5 text-3xl font-extrabold leading-[1.12] tracking-tight text-slate-900 sm:text-4xl">
              Can physiotherapy help manage{" "}
              <span className="bg-gradient-to-r from-teal-700 to-emerald-500 bg-clip-text text-transparent">
                Parkinson&apos;s disease?
              </span>
            </h2>
            <p className="mt-5 text-base leading-relaxed text-slate-600">
              Yes — for movement. Physiotherapy is one of the best-evidenced
              non-drug supports in Parkinson&apos;s care, and it works on the
              things that decide day-to-day independence: walking, balance,
              posture and confidence moving around your own home.
            </p>
            <p className="mt-4 rounded-xl border-l-2 border-teal-500 bg-slate-50 py-3 pl-4 pr-4 text-sm leading-relaxed text-slate-600">
              To be clear about what it does and doesn&apos;t do:
              physiotherapy manages symptoms and preserves function. It
              does not slow or reverse the condition, and it works alongside
              your neurologist&apos;s treatment — never instead of it.
            </p>

            <ul className="mt-7 grid gap-2.5 sm:grid-cols-2">
              {OUTCOMES.map((o) => (
                <li key={o} className="flex items-start gap-2.5 text-sm font-medium text-slate-700">
                  <i aria-hidden="true" className="fa-solid fa-circle-check mt-0.5 shrink-0 text-teal-600" />
                  {o}
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Visual */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
            className="relative"
          >
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 to-teal-950 p-8 shadow-xl">
              <div className="rounded-2xl bg-white/95 p-6">
                <CareIllustration id="parkinsons" className="mx-auto h-44 w-full text-teal-700" />
              </div>
              <div className="mt-6 grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="font-display text-lg font-bold text-white">Gait</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">Stride &amp; freezing</p>
                </div>
                <div className="border-x border-white/10">
                  <p className="font-display text-lg font-bold text-white">Balance</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">Falls risk</p>
                </div>
                <div>
                  <p className="font-display text-lg font-bold text-white">Posture</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">Stoop &amp; rigidity</p>
                </div>
              </div>
              <p className="mt-6 text-center text-xs leading-relaxed text-slate-300">
                Assessed live over video, in the rooms and doorways where
                freezing and turning actually happen.
              </p>
            </div>
          </motion.div>
        </div>

        {/* What the programme covers */}
        <div className="mt-16">
          <motion.h3
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, ease: EASE }}
            className="font-display text-center text-xl font-bold text-slate-900 sm:text-2xl"
          >
            What the programme works on
          </motion.h3>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FOCUS_AREAS.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: Math.min(i * 0.07, 0.35), ease: EASE }}
                className="group h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-teal-300 hover:shadow-xl hover:shadow-slate-900/5"
              >
                <span
                  aria-hidden="true"
                  className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700 transition-colors group-hover:bg-teal-100"
                >
                  <i className={`fa-solid ${f.icon}`} />
                </span>
                <h4 className="font-display text-base font-bold text-slate-900">{f.title}</h4>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.55, ease: EASE }}
          className="mt-14 overflow-hidden rounded-3xl bg-gradient-to-br from-teal-800 to-emerald-700 px-8 py-10 text-center shadow-xl sm:px-12"
        >
          <h3 className="font-display text-2xl font-extrabold text-white sm:text-3xl">
            Start with an assessment, not a guess
          </h3>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-teal-100">
            A 60-minute session establishes where mobility, balance and
            posture actually stand today — and gives you a home programme
            built around it, with family or carers welcome to join.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              href="/book"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-teal-800 shadow-lg transition hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-teal-800"
            >
              <i aria-hidden="true" className="fa-solid fa-calendar-check" />
              Book a Parkinson&apos;s assessment
            </Link>
            <Link
              href="/faq"
              className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-teal-800"
            >
              Read common questions
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
