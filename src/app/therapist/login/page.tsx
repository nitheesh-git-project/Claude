import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Therapist Network | Dr. Pooja's Physio",
};

export default function TherapistLoginPage() {
  return (
    <section className="py-16 max-w-md mx-auto px-4 text-center">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg">
        <div className="w-14 h-14 bg-purple-100 text-purple-700 rounded-xl flex items-center justify-center text-2xl mx-auto mb-4">
          <i className="fa-solid fa-user-doctor"></i>
        </div>
        <h1 className="text-xl font-bold text-slate-900">
          Therapist Network — Coming Soon
        </h1>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          Therapist applications and dashboards are being built next.
          Interested in joining the network? Reach out and we&apos;ll follow
          up directly.
        </p>
        <Link
          href="/hospitals"
          className="mt-6 inline-block w-full bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-4 rounded-xl text-xs transition shadow"
        >
          Contact Us
        </Link>
      </div>
    </section>
  );
}
