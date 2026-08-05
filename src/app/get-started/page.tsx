import type { Metadata } from "next";
import { Reveal, Stagger, StaggerItem, MotionButton } from "@/components/motion/primitives";

export const metadata: Metadata = {
  title: "Get Started | Dr. Pooja's Physio",
  description:
    "Choose how you would like to proceed today — book a consultation, sign in to the patient portal, or join the therapist network.",
};

export default function GetStartedPage() {
  return (
    <section className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <Reveal className="text-center max-w-2xl mx-auto mb-12">
        <span className="bg-teal-100 text-teal-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
          Welcome Hub
        </span>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 mt-3">
          Welcome to Dr. Pooja&apos;s Virtual Platform
        </h1>
        <p className="text-slate-600 text-sm mt-2">
          Choose how you would like to proceed today
        </p>
      </Reveal>

      <Stagger className="grid md:grid-cols-3 gap-8">
        {/* Portion 1: Direct Booking */}
        <StaggerItem className="h-full">
          <div className="bg-white rounded-2xl border-2 border-teal-600 p-6 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col justify-between h-full">
            <div>
              <div className="w-12 h-12 bg-teal-100 text-teal-700 rounded-xl flex items-center justify-center text-xl font-bold mb-4">
                <i className="fa-solid fa-calendar-plus"></i>
              </div>
              <span className="text-[11px] font-bold text-teal-700 uppercase tracking-wider block">
                Portion 1
              </span>
              <h2 className="font-display text-xl font-bold text-slate-900 mt-1">
                Book Consultation
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                For new or returning patients looking for an immediate 1-on-1
                virtual evaluation.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-slate-600">
                <li className="flex items-center gap-2">
                  <i className="fa-solid fa-check text-teal-600"></i> Auto
                  time-zone calendar slot selection
                </li>
                <li className="flex items-center gap-2">
                  <i className="fa-solid fa-check text-teal-600"></i> Instant
                  Razorpay UPI payment
                </li>
                <li className="flex items-center gap-2">
                  <i className="fa-solid fa-check text-teal-600"></i> Medical
                  history & MRI file upload
                </li>
              </ul>
            </div>
            <MotionButton href="/book" variant="primary" fullWidth className="mt-6 justify-center text-xs py-3">
              Book Consultation Now <i className="fa-solid fa-arrow-right"></i>
            </MotionButton>
          </div>
        </StaggerItem>

        {/* Portion 2: Patient Portal */}
        <StaggerItem className="h-full">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col justify-between h-full">
            <div>
              <div className="w-12 h-12 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center text-xl font-bold mb-4">
                <i className="fa-solid fa-user"></i>
              </div>
              <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block">
                Portion 2
              </span>
              <h2 className="font-display text-xl font-bold text-slate-900 mt-1">
                Patient Portal
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Sign in to view scheduled video calls, exercise guides, or
                submit a new registration.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-slate-600">
                <li className="flex items-center gap-2">
                  <i className="fa-solid fa-check text-blue-600"></i> Access
                  Google Meet video call links
                </li>
                <li className="flex items-center gap-2">
                  <i className="fa-solid fa-check text-blue-600"></i> Edit your
                  profile details securely
                </li>
                <li className="flex items-center gap-2">
                  <i className="fa-solid fa-check text-blue-600"></i> Requires
                  Admin verification for new accounts
                </li>
              </ul>
            </div>
            <MotionButton href="/patient/login" variant="dark" fullWidth className="mt-6 justify-center text-xs py-3">
              Patient Login / Sign Up <i className="fa-solid fa-arrow-right"></i>
            </MotionButton>
          </div>
        </StaggerItem>

        {/* Portion 3: Therapist Portal */}
        <StaggerItem className="h-full">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col justify-between h-full">
            <div>
              <div className="w-12 h-12 bg-purple-100 text-purple-700 rounded-xl flex items-center justify-center text-xl font-bold mb-4">
                <i className="fa-solid fa-user-doctor"></i>
              </div>
              <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider block">
                Portion 3
              </span>
              <h2 className="font-display text-xl font-bold text-slate-900 mt-1">
                Therapist Network
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                For onboarded physiotherapists to log in or peer doctors
                applying to join the network.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-slate-600">
                <li className="flex items-center gap-2">
                  <i className="fa-solid fa-check text-purple-600"></i> View
                  assigned patient schedules
                </li>
                <li className="flex items-center gap-2">
                  <i className="fa-solid fa-check text-purple-600"></i> Submit
                  post-session SOAP feedback
                </li>
                <li className="flex items-center gap-2">
                  <i className="fa-solid fa-check text-purple-600"></i> Track
                  your earned commission in ₹ INR
                </li>
              </ul>
            </div>
            <MotionButton
              href="/therapist/login"
              variant="purple"
              fullWidth
              className="mt-6 justify-center text-xs py-3"
            >
              Therapist Portal Login / Apply <i className="fa-solid fa-arrow-right"></i>
            </MotionButton>
          </div>
        </StaggerItem>
      </Stagger>
    </section>
  );
}
