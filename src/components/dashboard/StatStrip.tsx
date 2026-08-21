import type { ReactNode } from "react";

// The four-figure strip that opens every dashboard: the same shape on the
// patient's Health Profile, the therapist's week, the hospital's referrals
// and the admin's Today. One component so the numbers line up, wrap the
// same way on a phone, and never drift into four slightly different cards.
//
// `accent` is a Tailwind background class for the tick beside the label --
// it carries meaning (teal = the viewer's own figure, red/amber/emerald =
// a status band, slate = a plain count) and is never decorative.
export type StatCell = {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  accent?: string;
  valueClass?: string;
  href?: string;
};

function Cell({ cell }: { cell: StatCell }) {
  const body = (
    <>
      <div className="flex items-center gap-1.5">
        <span aria-hidden className={`h-2.5 w-1 rounded-full ${cell.accent ?? "bg-slate-300"}`} />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{cell.label}</p>
      </div>
      <p className="mt-1 flex items-baseline gap-1">
        <span className={`font-display text-2xl font-bold leading-none ${cell.valueClass ?? "text-slate-800"}`}>
          {cell.value}
        </span>
        {cell.unit && <span className="text-xs font-semibold text-slate-400">{cell.unit}</span>}
      </p>
      {cell.note && <p className="mt-1 text-[11px] leading-snug text-slate-500">{cell.note}</p>}
    </>
  );

  if (cell.href) {
    return (
      <a href={cell.href} className="block px-4 py-3 transition hover:bg-slate-50 sm:px-5">
        {body}
      </a>
    );
  }
  return <div className="px-4 py-3 sm:px-5">{body}</div>;
}

export default function StatStrip({
  cells,
  footer,
}: {
  cells: StatCell[];
  /** Optional full-width strip under the cells -- a progress bar, a
   *  one-line summary, a link out. */
  footer?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div
        className={`grid divide-y divide-slate-100 sm:divide-y-0 ${
          cells.length >= 4
            ? "grid-cols-2 sm:grid-cols-4 sm:divide-x"
            : cells.length === 3
              ? "grid-cols-1 sm:grid-cols-3 sm:divide-x"
              : "grid-cols-2 sm:divide-x"
        } divide-x`}
      >
        {cells.map((cell) => (
          <Cell key={cell.label} cell={cell} />
        ))}
      </div>
      {footer && (
        <div className="flex items-center gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5">
          {footer}
        </div>
      )}
    </div>
  );
}

/** The progress bar + caption used as a StatStrip footer on the patient's
 *  Health Profile and the therapist's payout progress alike. */
export function StripProgress({ percent, caption }: { percent: number; caption: string }) {
  return (
    <>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-teal-600 transition-all duration-500"
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </div>
      <p className="shrink-0 text-[11px] font-semibold text-slate-500">{caption}</p>
    </>
  );
}
