import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get Started | Dr. Pooja's Physio",
  description:
    "Choose how you would like to proceed today — book a consultation, sign in to the patient portal, or join the therapist network.",
};

export default function GetStartedPage() {
  return (
    <section className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <span className="bg-teal-100 text-teal-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
          Welcome Hub
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-3">
          Welcome to Dr. Pooja&apos;s Virtual Platform
        </h1>
        <p className="text-slate-600 text-sm mt-2">
          Choose how you would like to proceed today
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Portion 1: Direct Booking */}
        <div className="bg-white rounded-2xl border-2 border-teal-600 p-6 shadow-md hover:shadow-xl transition flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 bg-teal-100 text-teal-700 rounded-xl flex items-center justify-center text-xl font-bold mb-4">
              <i className="fa-solid fa-calendar-plus"></i>
            </div>
            <span className="text-[11px] font-bold text-teal-700 uppercase tracking-wider block">
              Portion 1
            </span>
            <h2 className="text-xl font-bold text-slate-900 mt-1">
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
                Razorpay UPI payment (₹1,999 INR)
              </li>
              <li className="flex items-center gap-2">
                <i className="fa-solid fa-check text-teal-600"></i> Medical
                history & MRI file upload
              </li>
            </ul>
          </div>
          <Link
            href="/book"
            className="mt-6 w-full bg-teal-700 hover:bg-teal-800 text-white font-bold py-3 px-4 rounded-xl text-xs transition shadow flex items-center justify-center gap-2"
          >
            Book Consultation Now (₹1,999 INR){" "}
            <i className="fa-solid fa-arrow-right"></i>
          </Link>
        </div>

        {/* Portion 2: Patient Portal */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-xl transition flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center text-xl font-bold mb-4">
              <i className="fa-solid fa-user"></i>
            </div>
            <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block">
              Portion 2
            </span>
            <h2 className="text-xl font-bold text-slate-900 mt-1">
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
          <Link
            href="/patient/login"
            className="mt-6 w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 px-4 rounded-xl text-xs transition shadow flex items-center justify-center gap-2"
          >
            Patient Login / Sign Up <i className="fa-solid fa-arrow-right"></i>
          </Link>
        </div>

        {/* Portion 3: Therapist Portal */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-xl transition flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 bg-purple-100 text-purple-700 rounded-xl flex items-center justify-center text-xl font-bold mb-4">
              <i className="fa-solid fa-user-doctor"></i>
            </div>
            <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider block">
              Portion 3
            </span>
            <h2 className="text-xl font-bold text-slate-900 mt-1">
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
                earned 70% commission in ₹ INR
              </li>
            </ul>
          </div>
          <Link
            href="/therapist/login"
            className="mt-6 w-full bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-4 rounded-xl text-xs transition shadow flex items-center justify-center gap-2"
          >
            Therapist Portal Login / Apply{" "}
            <i className="fa-solid fa-arrow-right"></i>
          </Link>
        </div>
      </div>
    </section>
  );
}
