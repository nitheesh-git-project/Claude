import type { Metadata } from "next";
import StepScroller from "@/components/howitworks/StepScroller";
import { Reveal, Stagger, StaggerItem, MotionButton, FloatingOrbs } from "@/components/motion/primitives";

export const metadata: Metadata = {
  title: "How It Works | Dr. Pooja's Physio",
  description:
    "Your path to recovery in 3 steps: book a slot in your timezone, a 60-minute guided video assessment, and a home exercise plan built for your space.",
};

const OBJECTIONS = [
  {
    icon: "fa-hand",
    q: "Without hands-on treatment, does it actually work?",
    a: "Most musculoskeletal recovery is driven by graded, correctly-performed exercise — not by passive treatment. What a therapist needs is to see how you move, and video shows that clearly.",
  },
  {
    icon: "fa-house-laptop",
    q: "Why is being at home an advantage?",
    a: "Your pain happens in your chair, at your desk, in your bed. Assessing you there means the plan is fitted to the environment you'll actually rehab in.",
  },
  {
    icon: "fa-calendar-day",
    q: "What if I'm in a different country?",
    a: "Slots are shown in your own timezone and confirmed before the call. Sessions run on Google Meet, so there's nothing to install beyond a browser.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-b from-teal-50/70 to-white py-20">
        <FloatingOrbs />
        <Reveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-800">
            <i className="fa-solid fa-route text-teal-600" />
            Three steps, start to plan
          </span>
          <h1 className="font-display mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl">
            What actually happens when you book a session
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            No vague promises — here is the exact path from picking a time to
            working through a plan built around your own home.
          </p>
        </Reveal>
      </div>

      <div className="py-16">
        <StepScroller />
      </div>

      {/* The three things people hesitate over, answered plainly. */}
      <div className="border-y border-slate-100 bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">
              The questions people ask before booking
            </h2>
          </Reveal>
          <Stagger className="grid gap-6 md:grid-cols-3">
            {OBJECTIONS.map((o) => (
              <StaggerItem key={o.q}>
                <div className="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                    <i className={`fa-solid ${o.icon}`} />
                  </span>
                  <h3 className="font-display text-base font-bold text-slate-900">
                    {o.q}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{o.a}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </div>

      <div className="relative overflow-hidden py-20">
        <div className="absolute inset-0 bg-gradient-to-br from-teal-800 to-emerald-700" />
        <FloatingOrbs className="opacity-40" />
        <Reveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl font-extrabold text-white sm:text-4xl">
            Step one takes about two minutes.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-teal-100">
            Pick a slot, and your therapist will have read your history before
            you join the call.
          </p>
          <div className="mt-8 flex justify-center">
            <MotionButton href="/book" variant="secondary">
              <i className="fa-solid fa-calendar-check text-teal-700" /> Book Your Assessment
            </MotionButton>
          </div>
        </Reveal>
      </div>
    </>
  );
}
