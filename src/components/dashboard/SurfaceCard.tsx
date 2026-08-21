import type { ReactNode } from "react";

// The one card every dashboard section sits in. Before this, four
// dashboards each had their own "white rounded box with a bold heading and
// a grey subtitle" written inline a few dozen times, which is why headings
// drifted between text-lg/text-base and padding between p-5/p-6.
//
// `id` is what the shell's anchor nav and scroll-spy target, so a section
// that appears in the sidebar must pass one.
export default function SurfaceCard({
  id,
  title,
  subtitle,
  icon,
  actions,
  padded = true,
  className = "",
  children,
}: {
  id?: string;
  title?: string;
  subtitle?: ReactNode;
  /** Font Awesome class, e.g. "fa-calendar-day". */
  icon?: string;
  actions?: ReactNode;
  padded?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-24 rounded-2xl border border-slate-200 bg-white shadow-sm ${padded ? "p-5 sm:p-6" : ""} ${className}`}
    >
      {(title || actions) && (
        <div className={`flex flex-wrap items-start justify-between gap-3 ${padded ? "mb-4" : "p-5 pb-0 sm:p-6 sm:pb-0"}`}>
          <div className="min-w-0">
            {title && (
              <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-800">
                {icon && <i aria-hidden className={`fa-solid ${icon} text-sm text-teal-600`} />}
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

const TONE: Record<string, string> = {
  neutral: "bg-slate-100 text-slate-600",
  info: "bg-blue-50 text-blue-700",
  good: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-700",
  bad: "bg-red-50 text-red-700",
  brand: "bg-teal-50 text-teal-700",
};

/** Status word + optional icon. Never colour alone: the word is always
 *  present, so a colour-blind reader and a greyscale print both work. */
export function StatusPill({
  tone = "neutral",
  icon,
  children,
}: {
  tone?: keyof typeof TONE | string;
  icon?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${TONE[tone] ?? TONE.neutral}`}
    >
      {icon && <i aria-hidden className={`fa-solid ${icon} text-[9px]`} />}
      {children}
    </span>
  );
}

/** What a section shows before it has any data. An empty dashboard is the
 *  first thing every new patient, therapist and hospital sees, so it says
 *  what will appear here and what to do next rather than "No data". */
export function EmptyState({
  icon = "fa-inbox",
  title,
  body,
  action,
}: {
  icon?: string;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-8 text-center">
      <i aria-hidden className={`fa-solid ${icon} text-lg text-slate-300`} />
      <p className="mt-2 font-display text-sm font-bold text-slate-700">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
