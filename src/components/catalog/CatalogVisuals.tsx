// Shared visual pieces for the catalog detail dialogs (session packages,
// home-visit packages, programmes). Everything here is derived from data the
// catalog already stores -- there is no extra admin field behind any of it,
// so a package configured today gets these visuals with no further work.
//
// Presentational only: the arithmetic lives in packageProgress /
// homeVisitProgress per AGENTS.md's "business math in dependency-free
// src/lib/ modules" rule, and is passed in already computed.

export function rupees(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

/**
 * One dot per session/visit in the package, so "8 sessions" is something a
 * visitor sees the size of rather than reads. Capped at 24 dots with a
 * numeric fallback: past that the row stops communicating a quantity and
 * turns into texture.
 */
export function SessionDots({
  count,
  unitLabel,
}: {
  count: number;
  unitLabel: string;
}) {
  if (count > 24) {
    return (
      <p className="text-sm font-semibold text-slate-700">
        {count} {unitLabel}
      </p>
    );
  }
  return (
    <div>
      <ul aria-hidden="true" className="flex flex-wrap gap-1.5">
        {Array.from({ length: count }, (_, i) => (
          <li
            key={i}
            className="h-3 w-3 rounded-full bg-teal-600/85 ring-2 ring-teal-100"
          />
        ))}
      </ul>
      <p className="mt-2 text-xs font-semibold text-slate-600">
        {count} {unitLabel} included
      </p>
    </div>
  );
}

/**
 * Per-session price against the price of buying those sessions one at a
 * time, as two bars on a shared scale. Renders nothing when there is no
 * comparison price -- a lone full-width bar next to no reference would
 * imply a saving that was never computed.
 */
export function SavingsMeter({
  perUnitPaise,
  comparePerUnitPaise,
  savingsPercent,
  unitLabel,
}: {
  perUnitPaise: number;
  comparePerUnitPaise: number | null;
  savingsPercent: number | null;
  unitLabel: string;
}) {
  if (comparePerUnitPaise === null || comparePerUnitPaise <= perUnitPaise) return null;
  const width = Math.max(8, Math.round((perUnitPaise / comparePerUnitPaise) * 100));

  return (
    <div className="rounded-2xl border border-teal-100 bg-teal-50/60 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-800">
          Price per {unitLabel}
        </p>
        {savingsPercent !== null && (
          <p className="text-xs font-bold text-teal-700">Save {savingsPercent}%</p>
        )}
      </div>

      <div className="mt-3 space-y-2.5">
        <div>
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>In this package</span>
            <span className="font-bold text-slate-900">{rupees(perUnitPaise)}</span>
          </div>
          <div aria-hidden="true" className="mt-1 h-2.5 w-full rounded-full bg-white">
            <div className="h-2.5 rounded-full bg-teal-600" style={{ width: `${width}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>Booked one at a time</span>
            <span className="font-semibold text-slate-500">
              {rupees(comparePerUnitPaise)}
            </span>
          </div>
          <div aria-hidden="true" className="mt-1 h-2.5 w-full rounded-full bg-white">
            <div className="h-2.5 w-full rounded-full bg-slate-300" />
          </div>
        </div>
      </div>
    </div>
  );
}

export type StatTile = { label: string; value: string; icon: string };

/** Label/value tiles for the facts a visitor scans for before reading prose. */
export function StatTiles({ items }: { items: StatTile[] }) {
  if (items.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <i aria-hidden="true" className={`fa-solid ${item.icon} text-teal-600`} />
            {item.label}
          </dt>
          <dd className="font-display mt-1 text-sm font-bold text-slate-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CheckList({ items, title }: { items: string[]; title: string }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-6">
      <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700">
        {title}
      </h4>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm leading-snug text-slate-700">
            <i
              aria-hidden="true"
              className="fa-solid fa-circle-check mt-0.5 shrink-0 text-teal-600"
            />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The paragraph sections that only render when the admin filled them in. */
export function ProseSection({
  title,
  body,
}: {
  title: string;
  body: string | null | undefined;
}) {
  if (!body?.trim()) return null;
  return (
    <section className="mt-6">
      <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700">
        {title}
      </h4>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{body}</p>
    </section>
  );
}
