"use client";

import { useState } from "react";

// Print (the browser's own print dialog, for the screen as it stands) and
// a typeset PDF of the patient's record, named after them
// (Priya_Sharma_PT0042.pdf) -- the file a patient actually carries to
// another clinician. Full right-to-erasure is a retention-policy decision
// for the practice, not something to build without that call being made
// first, so there's deliberately no delete button here yet.
//
// The download is fetched rather than a plain link. The export refuses to
// produce a partial record when one of its reads fails, and a plain link
// would show that refusal as a page of raw JSON; fetched, it is a sentence
// beside the button and the patient stays where they were.
export default function HealthProfileActions() {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setError(null);
    setDownloading(true);
    try {
      const res = await fetch("/api/patient/condition-profile/export");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not download your record. Please try again.");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "health-profile.pdf";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not download your record. Check your connection and try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1 print:hidden">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => window.print()}
          className="text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 px-3 py-1.5 rounded-lg transition"
        >
          Print
        </button>
        <button
          type="button"
          onClick={download}
          disabled={downloading}
          aria-busy={downloading}
          className="text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 px-3 py-1.5 rounded-lg transition disabled:opacity-60"
        >
          <i
            aria-hidden
            className={`fa-solid ${downloading ? "fa-spinner fa-spin" : "fa-file-pdf"} mr-1.5`}
          />
          {downloading ? "Preparing…" : "Download as PDF"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[11px] text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
