import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How It Works | Dr. Pooja's Physio",
  description:
    "Your path to recovery in 3 simple steps: smart booking, a 60-minute HD video call, and a custom home exercise plan.",
};

const steps = [
  {
    num: 1,
    title: "Smart Booking & Intake",
    desc: "Auto-timezone slot selection, instant Razorpay UPI payment in ₹ INR, and secure file upload for your X-rays/MRIs.",
  },
  {
    num: 2,
    title: "60-Min HD Video Call",
    desc: "1-on-1 visual movement assessment, posture analysis, and active pain response testing on Google Meet.",
  },
  {
    num: 3,
    title: "Custom Home Exercise Plan",
    desc: "Receive video-guided daily stretches tailored to your chair, bed, and home environment with ongoing follow-up.",
  },
];

export default function HowItWorksPage() {
  return (
    <section className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <h1 className="text-3xl font-bold text-slate-900">
          Your Path to Recovery in 3 Simple Steps
        </h1>
        <p className="text-slate-600 mt-2 text-sm">
          How virtual physical therapy achieves clinical success without
          physical touch.
        </p>
      </div>
      <div className="grid md:grid-cols-3 gap-8">
        {steps.map((s) => (
          <div
            key={s.num}
            className="bg-white p-6 rounded-2xl border border-slate-200 text-center relative shadow-sm"
          >
            <div className="w-12 h-12 bg-teal-700 text-white rounded-full flex items-center justify-center font-bold text-lg mx-auto mb-4">
              {s.num}
            </div>
            <h3 className="font-bold text-lg text-slate-800">{s.title}</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              {s.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
