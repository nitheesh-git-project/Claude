import type { Metadata } from "next";
import { Reveal, Stagger, StaggerItem, MotionButton, FloatingOrbs } from "@/components/motion/primitives";

export const metadata: Metadata = {
  title: "How It Works | Dr. Pooja's Physio",
  description:
    "Your path to recovery in 3 simple steps: smart booking, a 60-minute HD video call, and a custom home exercise plan.",
};

const steps = [
  {
    num: 1,
    icon: "fa-calendar-check",
    title: "Smart Booking & Intake",
    desc: "Auto-timezone slot selection, instant Razorpay UPI payment in ₹ INR, and secure file upload for your X-rays/MRIs.",
  },
  {
    num: 2,
    icon: "fa-video",
    title: "60-Min HD Video Call",
    desc: "1-on-1 visual movement assessment, posture analysis, and active pain response testing on Google Meet.",
  },
  {
    num: 3,
    icon: "fa-person-walking-arrow-right",
    title: "Custom Home Exercise Plan",
    desc: "Receive video-guided daily stretches tailored to your chair, bed, and home environment with ongoing follow-up.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <div className="relative overflow-hidden bg-gradient-to-b from-teal-50/70 to-white py-16 border-b border-slate-100">
        <FloatingOrbs />
        <Reveal className="relative text-center max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="font-display text-3xl sm:text-5xl font-extrabold text-slate-900">
            Your Path to Recovery in 3 Simple Steps
          </h1>
          <p className="text-slate-600 mt-3 text-base">
            How virtual physical therapy achieves clinical success without
            physical touch.
          </p>
        </Reveal>
      </div>

      <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Stagger className="grid md:grid-cols-3 gap-8 relative">
          <div className="hidden md:block absolute top-14 left-[16.6%] right-[16.6%] h-px bg-gradient-to-r from-teal-200 via-teal-300 to-teal-200" />
          {steps.map((s) => (
            <StaggerItem key={s.num}>
              <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center relative shadow-sm hover:shadow-lg hover:shadow-slate-900/5 transition-shadow h-full">
                <div className="w-14 h-14 bg-gradient-to-br from-teal-600 to-emerald-600 text-white rounded-2xl flex items-center justify-center text-xl mx-auto mb-5 shadow-lg shadow-teal-900/20">
                  <i className={`fa-solid ${s.icon}`}></i>
                </div>
                <span className="text-xs font-bold text-teal-700 uppercase tracking-wider">
                  Step {s.num}
                </span>
                <h3 className="font-display font-bold text-lg text-slate-800 mt-1">{s.title}</h3>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                  {s.desc}
                </p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal delay={0.1} className="mt-16 text-center">
          <MotionButton href="/book" variant="primary">
            <i className="fa-solid fa-calendar-check"></i> Start Your First Session
          </MotionButton>
        </Reveal>
      </section>
    </>
  );
}
