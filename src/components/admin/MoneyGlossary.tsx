import { GLOSSARY_ORDER, MONEY_TERMS, SCOPE_LABEL } from "@/lib/moneyTerms";

// The full vocabulary, at the foot of every Money screen.
//
// It is the fallback now rather than the answer: each figure carries its own
// (i) with the same sentence beside the number (see MoneyFigure), and this is
// for reading the whole set at once -- what separates gross from net, or a
// balance from a flow. Both read src/lib/moneyTerms.ts, so the two can never
// give one figure two definitions, which is the "one word, one figure" rule
// applied to the explanations themselves.
//
// Plain server component -- a table of text with no state.
export default function MoneyGlossary() {
  return (
    <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <summary className="cursor-pointer px-6 py-4 text-sm font-bold text-slate-800">
        What each number means
      </summary>
      <div className="border-t border-slate-100 px-6 py-4">
        <p className="mb-4 text-xs text-slate-500">
          One word, one figure. Every figure also carries this sentence on an{" "}
          <i aria-hidden className="fa-solid fa-info text-[9px]" /> beside it.{" "}
          <span className="font-semibold text-slate-600">These dates</span> means the figure is
          measured over the range you have chosen;{" "}
          <span className="font-semibold text-amber-700">Right now</span> means it is a balance
          this instant and the dates do not touch it.
        </p>
        <dl className="space-y-3">
          {GLOSSARY_ORDER.map((key) => {
            const entry = MONEY_TERMS[key];
            return (
              <div key={key} className="grid grid-cols-1 gap-1 sm:grid-cols-[180px_1fr] sm:gap-4">
                <dt className="text-xs font-bold text-slate-800">
                  {entry.term}
                  <span
                    className={`ml-2 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                      entry.scope === "now"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {SCOPE_LABEL[entry.scope]}
                  </span>
                </dt>
                <dd className="text-xs text-slate-600">{entry.meaning}</dd>
              </div>
            );
          })}
        </dl>
      </div>
    </details>
  );
}
