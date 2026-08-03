import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account Suspended | Dr. Pooja's Physio",
};

export default function AccountSuspendedPage() {
  return (
    <section className="py-16 max-w-lg mx-auto px-4 text-center">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
          <i className="fa-solid fa-ban"></i>
        </div>
        <h1 className="text-xl font-bold text-slate-900">Account Suspended</h1>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          Your account access has been suspended. If you believe this is a
          mistake, please contact us directly to resolve it.
        </p>
      </div>
    </section>
  );
}
