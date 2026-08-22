"use client";

import { useState } from "react";
import { downloadCsv, toCsv, type CsvColumn } from "@/lib/csvExport";

// Every admin export offers the same two formats, from one column
// definition: CSV for a spreadsheet, PDF for a person. Callers pass the
// rows they are rendering (already filtered) and the columns -- never a
// pre-built string -- so the two downloads can't describe different
// tables.
//
// CSV is built in the browser, as it always was: no dependency and no
// round trip. The PDF is typeset server-side by /api/admin/export-pdf,
// which keeps pdf-lib out of the admin dashboard's client bundle -- the
// dashboard already ships every screen at once, and half a megabyte of
// font tables for a button most admins press occasionally is the wrong
// trade.
export default function DataExportButtons<T>({
  filename,
  title,
  subtitle,
  rows,
  columns,
  disabled,
}: {
  /** Base name, no extension -- each format adds its own, plus the date. */
  filename: string;
  /** Heading printed on the PDF. Defaults to the filename if omitted. */
  title?: string;
  /** What the rows are scoped to (range, filters), printed under the
   *  heading. A printed table nobody can date is not much use. */
  subtitle?: string;
  rows: T[];
  columns: CsvColumn<T>[];
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEmpty = disabled || rows.length === 0;
  const heading = title ?? filename;

  function handleCsv() {
    const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    downloadCsv(`${filename}-${day}.csv`, toCsv(rows, columns));
  }

  async function handlePdf() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename,
          title: heading,
          subtitle,
          columns: columns.map((column) => column.header),
          rows: rows.map((row) => columns.map((column) => String(column.value(row)))),
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Could not build that PDF.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      // Filename comes from the response's Content-Disposition when the
      // browser follows a navigation, but this is a blob -- so it is set
      // here to the same shape the route uses.
      const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      link.download = `${filename}-${day}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build that PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-[11px] font-medium text-red-600">{error}</span>}
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Download</span>
      <button
        type="button"
        onClick={handleCsv}
        disabled={isEmpty}
        className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline"
      >
        <i aria-hidden className="fa-solid fa-file-csv"></i> CSV
      </button>
      <button
        type="button"
        onClick={handlePdf}
        disabled={isEmpty || busy}
        className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline"
      >
        <i aria-hidden className="fa-solid fa-file-pdf"></i> {busy ? "Building…" : "PDF"}
      </button>
    </div>
  );
}
