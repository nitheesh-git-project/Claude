import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Application Received | Dr. Pooja's Physio",
};

export default function PendingApprovalPage() {
  return (
    <section className="py-16 max-w-lg mx-auto px-4 text-center">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg">
        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
          <i className="fa-solid fa-clock"></i>
        </div>
        <h1 className="text-xl font-bold text-slate-900">
          Application Received
        </h1>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          Thanks for applying to join the therapist network. Your credentials
          are being reviewed — you&apos;ll get access to your dashboard once
          an admin approves your account.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 px-4 rounded-xl text-xs transition shadow"
        >
          Back to Home
        </Link>
      </div>
    </section>
  );
}
