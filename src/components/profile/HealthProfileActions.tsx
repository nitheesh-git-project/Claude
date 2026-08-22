"use client";

// Print (the browser's own print dialog, for the screen as it stands) and
// a typeset PDF of the patient's record, named after them
// (Priya_Sharma_PT0042.pdf) -- the file a patient actually carries to
// another clinician. Full right-to-erasure is a retention-policy decision
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
        <i aria-hidden className="fa-solid fa-file-pdf mr-1.5" />
        Download as PDF
      </a>
    </div>
  );
}
