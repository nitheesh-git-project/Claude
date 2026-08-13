"use client";

// Print (browser's own print-to-PDF covers "export as PDF" without a new
// dependency) and a JSON download of the patient's own data
// (/api/patient/condition-profile/export) -- a first, safe step toward
// data portability. Full right-to-erasure is a retention-policy decision
// for the practice, not something to build without that call being made
// first, so there's deliberately no delete button here yet.
export default function HealthProfileActions() {
  return (
    <div className="flex items-center gap-3 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 px-3 py-1.5 rounded-lg transition"
      >
        Print
      </button>
      <a
        href="/api/patient/condition-profile/export"
        className="text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 px-3 py-1.5 rounded-lg transition"
      >
        Download my data
      </a>
    </div>
  );
}
