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

  // The patient's page keeps most of the record in closed blocks (B2); a
  // printout of the screen opens them first, so it is the whole page.
  function printPage() {
    document.querySelectorAll("details").forEach((d) => {
      d.open = true;
    });
    window.print();
  }

  return (
    <div className="flex flex-col items-start gap-2 print:hidden">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={download}
          disabled={downloading}
          aria-busy={downloading}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          <i aria-hidden className={`fa-solid ${downloading ? "fa-spinner fa-spin" : "fa-file-pdf"}`} />
          {downloading ? "Preparing…" : "Download as PDF"}
        </button>
        <button
          type="button"
          onClick={printPage}
          className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
        >
          Print
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
