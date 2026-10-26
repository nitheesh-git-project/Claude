import type { ResultRow, ResultTone } from "@/lib/cockpit";

const VALUE_TONE: Record<ResultTone, string> = {
  done: "text-slate-900",
  todo: "text-slate-600",
  skipped: "text-amber-900",
  stopped: "text-amber-900",
  flag: "text-red-800",
};

/** Today's results so far, with Not done states. A live region, so a screen
 *  reader hears a result land when Save and next goes through. */
export default function ResultsPanel({ rows }: { rows: ResultRow[] }) {
  return (
    <section aria-labelledby="results-heading" className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 id="results-heading" className="font-display text-base font-bold text-slate-900">
        Today{"'"}s results
      </h3>
      <ul data-testid="results-list" aria-live="polite" className="mt-2.5 flex flex-col">
        {rows.map((row) => (
          <li key={row.id} data-testid={`result-${row.id}`} className="flex justify-between gap-3 border-b border-slate-100 py-2 text-[15px] last:border-b-0">
            <span className="min-w-0 text-slate-700 [overflow-wrap:anywhere]">{row.label}</span>
            <span className={`shrink-0 text-right font-bold ${VALUE_TONE[row.tone]}`}>{row.value}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[13px] text-slate-700">Compared with the first visit and the last visit once saved.</p>
    </section>
  );
}
