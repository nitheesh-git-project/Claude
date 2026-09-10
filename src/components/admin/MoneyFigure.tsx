"use client";

import { useId, useState } from "react";
import { MONEY_TERMS, SCOPE_LABEL, type MoneyTermKey } from "@/lib/moneyTerms";

// One money figure: its name, an (i) that says what it means, whether it
// moves with the dates, the amount, and one line of context.
//
// Before this, ten of these were hand-rolled divs inside AdminMetricsTab
// with their meanings collected in a collapsed glossary at the foot of the
// screen -- the definition as far from the figure as the page allowed. An
// admin reading "Clinic share ₹43,200" and wondering whether that was profit
// had to scroll past the charts, open a box, and find the row. Now the
// answer is beside the number, and it is the same sentence the glossary
// prints, because both read src/lib/moneyTerms.ts.
//
// The scope chip is the other half. Changing the date range moves some
// figures and not others -- correctly, since a debt is not a flow -- and
// without a word saying which, that reads as a screen that half-works.

export function MoneyTermInfo({ term }: { term: MoneyTermKey }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const entry = MONEY_TERMS[term];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-400 transition hover:border-teal-500 hover:text-teal-700"
      >
        {/* Named, because a screen reader meeting ten "What is this?" buttons
            on one screen learns nothing from any of them. */}
        <span className="sr-only">{`What is ${entry.term}?`}</span>
        <i aria-hidden className="fa-solid fa-info text-[8px]" />
      </button>
      {open && (
        // w-full so it takes a row of its own: every caller puts the (i) in
        // a wrapping flex line beside the label, where a paragraph would
        // otherwise squeeze in beside it as a third item.
        <p
          id={id}
          className="mt-2 w-full rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600"
        >
          {entry.meaning}
        </p>
      )}
    </>
  );
}

/** The chip that says whether this figure is measured over the dates in view
 *  or is true as of this instant. Only rendered where both kinds sit
 *  together, so it stays information rather than decoration. */
export function ScopeChip({ term }: { term: MoneyTermKey }) {
  const scope = MONEY_TERMS[term].scope;
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
        scope === "now" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      {SCOPE_LABEL[scope]}
    </span>
  );
}

export default function MoneyFigure({
  term,
  icon,
  iconClass = "text-teal-600",
  value,
  valueClass = "text-slate-900",
  valueStyle,
  note,
  showScope = false,
  highlight = false,
}: {
  term: MoneyTermKey;
  /** Font Awesome class, e.g. "fa-sack-dollar". */
  icon: string;
  iconClass?: string;
  value: string;
  valueClass?: string;
  valueStyle?: React.CSSProperties;
  note?: string;
  /** Print the "These dates" / "Right now" chip. */
  showScope?: boolean;
  highlight?: boolean;
}) {
  const entry = MONEY_TERMS[term];
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
        highlight ? "border-teal-200 bg-teal-50/40" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          <i aria-hidden className={`fa-solid ${icon} ${iconClass}`} /> {entry.term}
        </p>
        <MoneyTermInfo term={term} />
        {showScope && <ScopeChip term={term} />}
      </div>
      <p className={`mt-2 text-2xl font-bold ${valueClass}`} style={valueStyle}>
        {value}
      </p>
      {note && <p className="mt-1 text-[11px] text-slate-400">{note}</p>}
    </div>
  );
}
