import type { CSSProperties, ReactNode } from "react";
import ProgressLink from "@/components/system/ProgressLink";

export type SummaryFact = {
  label: string;
  value: string;
  /** One short line under the value. */
  note?: string;
  href?: string;
  tone?: "teal" | "amber" | "green" | "rose" | "slate";
};

export type SummaryAction = { label: string; href: string; icon?: string };

const DOT: Record<NonNullable<SummaryFact["tone"]>, string> = {
  teal: "bg-teal-500",
  amber: "bg-amber-500",
  green: "bg-emerald-500",
  rose: "bg-rose-500",
  slate: "bg-slate-300",
};

/**
 * The top of every dashboard tab: the answer to the question the tab exists
 * for, in one line, with the one action it leads to -- "When is my next
 * session?", "Is anything waiting on me?", "What am I owed?" -- and at most
 * four small figures under it. Everything the tab held before is still
 * below, unchanged; this is so nobody has to read it to find the point.
 *
 * `hero` is the teal card for a tab whose answer is an action (a session to
 * join, a programme to book); `plain` is white for a tab whose answer is a
 * fact (a total, a count). The figures rise in one after another.
 */
export default function TabSummary({
  eyebrow,
  title,
  detail,
  facts,
  action,
  secondary,
  tone = "plain",
  testId,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  detail?: ReactNode;
  facts?: SummaryFact[];
  action?: SummaryAction | null;
  secondary?: SummaryAction | null;
  tone?: "hero" | "plain";
  testId?: string;
  children?: ReactNode;
}) {
  const hero = tone === "hero";
  return (
    <section
      aria-label={eyebrow}
      data-testid={testId}
      className={`mr-rise mb-6 rounded-2xl p-5 shadow-sm sm:p-6 ${
        hero ? "bg-teal-700 text-white" : "border border-slate-200 bg-white text-slate-900"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className={`text-[13px] font-semibold uppercase tracking-wide ${hero ? "text-teal-100" : "text-teal-700"}`}>
            {eyebrow}
          </p>
          <h2 className="mt-1 text-xl font-bold leading-snug sm:text-2xl">{title}</h2>
          {detail && <p className={`mt-1 text-sm ${hero ? "text-teal-50" : "text-slate-600"}`}>{detail}</p>}
        </div>
        {(action || secondary) && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {action && (
              <ProgressLink
                href={action.href}
                className={`mr-breathe inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-5 text-base font-bold transition sm:flex-none ${
                  hero ? "bg-white text-teal-800 hover:bg-teal-50" : "bg-teal-700 text-white hover:bg-teal-800"
                }`}
              >
                {action.icon && <i aria-hidden className={`fa-solid ${action.icon} text-sm`} />}
                {action.label}
              </ProgressLink>
            )}
            {secondary && (
              <ProgressLink
                href={secondary.href}
                className={`inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition sm:flex-none ${
                  hero ? "bg-white/15 text-white hover:bg-white/25" : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                }`}
              >
                {secondary.icon && <i aria-hidden className={`fa-solid ${secondary.icon} text-sm`} />}
                {secondary.label}
              </ProgressLink>
            )}
          </div>
        )}
      </div>
      {facts && facts.length > 0 && (
        <dl className={`mt-4 grid gap-2.5 ${facts.length >= 4 ? "grid-cols-2 lg:grid-cols-4" : facts.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {facts.map((f, i) => {
            const body = (
              <>
                <dt className={`flex items-center gap-1.5 text-[13px] font-semibold ${hero ? "text-teal-100" : "text-slate-500"}`}>
                  <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${hero ? "bg-teal-200" : DOT[f.tone ?? "teal"]}`} />
                  {f.label}
                </dt>
                <dd className="mt-0.5 font-display text-lg font-extrabold leading-tight sm:text-xl">{f.value}</dd>
                {f.note && (
                  <dd className={`mt-0.5 text-[13px] leading-snug ${hero ? "text-teal-50" : "text-slate-500"}`}>{f.note}</dd>
                )}
              </>
            );
            const cls = `mr-rise block min-w-0 rounded-xl px-3 py-2.5 ${hero ? "bg-white/10" : "bg-slate-50"}`;
            const style = { "--d": `${80 + i * 50}ms` } as CSSProperties;
            return f.href ? (
              <div key={f.label} style={style} className={cls}>
                <ProgressLink href={f.href} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
                  {body}
                </ProgressLink>
              </div>
            ) : (
              <div key={f.label} style={style} className={cls}>
                {body}
              </div>
            );
          })}
        </dl>
      )}
      {children}
    </section>
  );
}

/**
 * "On this page" chips: one tap to each section of a long tab, for the widths
 * where the sidebar's own sub-entries are not on screen (phone, tablet, the
 * icon rail). Plain anchors, so the browser's own smooth scroll and the
 * sections' `scroll-mt` do the work and they work without JavaScript.
 */
export function JumpChips({
  items,
  className = "2xl:hidden",
}: {
  items: { id: string; label: string; count?: number | null }[];
  className?: string;
}) {
  if (items.length < 2) return null;
  return (
    <nav aria-label="On this page" className={`-mx-1 mb-5 overflow-x-auto px-1 pb-1 ${className}`}>
      <ul className="flex w-max gap-2">
        {items.map((it, i) => (
          <li key={it.id} className="mr-rise" style={{ "--d": `${120 + i * 40}ms` } as CSSProperties}>
            <a
              href={`#${it.id}`}
              className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-teal-400 hover:text-teal-800"
            >
              {it.label}
              {typeof it.count === "number" && it.count > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-100 px-1.5 text-[12px] font-bold text-amber-800">
                  {it.count}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
