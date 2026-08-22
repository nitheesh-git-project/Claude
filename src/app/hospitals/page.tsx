import type { Metadata } from "next";
import HospitalInquiryForm from "@/components/HospitalInquiryForm";
import SectionNav, { type SectionNavItem } from "@/components/SectionNav";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/primitives";

export const metadata: Metadata = {
  title: "For Hospitals (B2B) | Dr. Pooja's Physio",
  description:
    "Extend post-discharge care virtually. Structured rehabilitation for out-of-town patients, with progress reported back to the referring surgeon.",
};

const PROBLEM = [
  {
    icon: "fa-plane-departure",
    title: "The patient goes home",
    body: "Out-of-town patients travel back after discharge and rarely return for follow-up physiotherapy.",
  },
  {
    icon: "fa-link-slash",
    title: "The protocol breaks",
    body: "Rehabilitation stalls or is done incorrectly, and no one on your side finds out until something goes wrong.",
  },
  {
    icon: "fa-file-circle-question",
    title: "You lose visibility",
    body: "The surgical outcome is judged on a recovery you had no way to observe or influence.",
  },
];

const SOLUTION = [
  {
    icon: "fa-video",
    title: "Structured virtual rehab",
    body: "Your patient is assessed and progressed over video on a protocol aligned with your discharge instructions.",
  },
  {
    icon: "fa-chart-line",
    title: "Progress reported back",
    body: "Referring surgeons receive periodic updates on range of motion, adherence and milestones reached.",
  },
  {
    icon: "fa-earth-asia",
    title: "Anywhere the patient lives",
    body: "Geography stops being the reason continuity of care ends at the hospital door.",
  },
];

export default function HospitalsPage() {
  // The hero (with the inquiry form) deliberately gets no entry: it already
  // fills the screen on landing, and giving it one would light a pill up
  // before the visitor has scrolled anywhere.
  const sectionNavItems: SectionNavItem[] = [
    { id: "the-gap", label: "The Gap", icon: "fa-triangle-exclamation" },
    { id: "our-approach", label: "Our Approach", icon: "fa-hand-holding-medical" },
  ];

  return (
    <>
      <SectionNav items={sectionNavItems} />

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <Reveal className="relative overflow-hidden rounded-3xl bg-slate-900 p-8 shadow-xl sm:p-12">
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-teal-500/15 blur-3xl" />
          <div className="relative grid items-center gap-10 md:grid-cols-2">
            <div>
              <span className="rounded-full border border-teal-500/30 bg-teal-500/20 px-3 py-1 text-xs font-bold text-teal-300">
                B2B Hospital Partnership
              </span>
              <h1 className="font-display mt-5 text-3xl font-extrabold leading-tight text-white sm:text-4xl">
                Post-discharge care that doesn&apos;t end at the hospital door
              </h1>
              <p className="mt-4 text-base leading-relaxed text-slate-300">
                Hospitals lose contact with out-of-town patients after surgery.
                We provide structured virtual rehabilitation that keeps
                recovery on protocol — and keeps the referring surgeon informed.
              </p>
              <div className="mt-8 grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
                <div>
                  <p className="font-display text-2xl font-bold text-white">60 min</p>
                  <p className="text-xs text-slate-400">Initial assessment</p>
                </div>
                <div>
                  <p className="font-display text-2xl font-bold text-white">Video</p>
                  <p className="text-xs text-slate-400">No patient travel</p>
                </div>
                <div>
                  <p className="font-display text-2xl font-bold text-white">Reported</p>
                  <p className="text-xs text-slate-400">Back to your team</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-white p-6 text-slate-800 shadow-lg">
              <HospitalInquiryForm />
            </div>
          </div>
        </Reveal>
      </section>

      {/* Problem → solution, stated plainly enough to skim. */}
      <section id="the-gap" className="scroll-mt-28 border-y border-slate-100 bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-rose-600">
              The gap
            </span>
            <h2 className="font-display mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
              What happens after discharge today
            </h2>
          </Reveal>
          <Stagger className="grid gap-6 md:grid-cols-3">
            {PROBLEM.map((p) => (
              <StaggerItem key={p.title}>
                <div className="h-full rounded-2xl border border-slate-200 bg-white p-6">
                  <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                    <i className={`fa-solid ${p.icon}`} />
                  </span>
                  <h3 className="font-display text-base font-bold text-slate-900">
                    {p.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{p.body}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          <Reveal className="my-12 flex justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-teal-600 shadow-sm">
              <i className="fa-solid fa-arrow-down" />
            </span>
          </Reveal>

          {/* Real wrapper, not a zero-height anchor: the rail decides what is
              active by which section crosses the viewport centre, and a
              height-less marker can never satisfy that. */}
          <div id="our-approach" className="scroll-mt-28">
            <Reveal className="mx-auto mb-12 max-w-2xl text-center">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">
                With a partnership
              </span>
              <h2 className="font-display mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
                What we put in its place
              </h2>
            </Reveal>
            <Stagger className="grid gap-6 md:grid-cols-3">
              {SOLUTION.map((s) => (
                <StaggerItem key={s.title}>
                  <div className="h-full rounded-2xl border border-teal-200 bg-white p-6 shadow-sm">
                    <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                      <i className={`fa-solid ${s.icon}`} />
                    </span>
                    <h3 className="font-display text-base font-bold text-slate-900">
                      {s.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.body}</p>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </div>
      </section>
    </>
  );
}
