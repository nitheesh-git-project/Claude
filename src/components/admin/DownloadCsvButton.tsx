"use client";

import { downloadCsv } from "@/lib/csvExport";

export default function DownloadCsvButton({
  filename,
  csv,
  disabled,
}: {
  filename: string;
  csv: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => downloadCsv(filename, csv)}
      disabled={disabled}
      className="text-xs font-semibold text-teal-700 hover:underline disabled:text-slate-300 disabled:no-underline disabled:cursor-not-allowed flex items-center gap-1.5"
    >
      <i className="fa-solid fa-download"></i> Download CSV
    </button>
  );
}
