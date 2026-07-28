import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Patient Portal | Dr. Pooja's Physio",
};

export default function PatientLoginPage() {
  return (
    <section className="py-16 max-w-md mx-auto px-4 text-center">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg">
        <div className="w-14 h-14 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center text-2xl mx-auto mb-4">
          <i className="fa-solid fa-user"></i>
        </div>
        <h1 className="text-xl font-bold text-slate-900">
          Patient Portal — Coming Soon
        </h1>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          Secure patient accounts, video call access, and rehab plan tracking
          are being built next. For now, book a consultation directly and
          we&apos;ll set your account up personally.
        </p>
        <Link
          href="/book"
          className="mt-6 inline-block w-full bg-teal-700 hover:bg-teal-800 text-white font-bold py-3 px-4 rounded-xl text-xs transition shadow"
        >
          Book a Consultation Instead
        </Link>
      </div>
    </section>
  );
}
