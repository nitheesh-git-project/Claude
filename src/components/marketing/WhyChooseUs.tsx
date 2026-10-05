import { Reveal, Stagger, StaggerItem } from "@/components/motion/primitives";
import { REAL_BENEFITS, WHY_CHOOSE_US } from "@/lib/whyChooseUs";

/**
 * "Why choose us" -- six reasons as icon cards. `compact` (the home page)
 * gives each one line; the full version (/mission) adds how the platform
 * actually does it. Copy lives in src/lib/whyChooseUs.ts.
 */
export function WhyChooseUsGrid({ compact = false }: { compact?: boolean }) {
  return (
    <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-5">
      {WHY_CHOOSE_US.map((item) => (
        <StaggerItem key={item.key} className="h-full">
          <div className="group h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md sm:p-6">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 transition group-hover:bg-teal-700 group-hover:text-white">
                <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-display text-[15px] font-bold text-slate-900">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{item.line}</p>
                {!compact && (
                  <p className="mt-3 border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-500">
                    {item.detail}
                  </p>
                )}
              </div>
            </div>
          </div>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

/**
 * "The real benefits" -- six numbered outcomes. Numbered rather than iconed
 * so the band reads as a different kind of list from the reasons above it:
 * those are what we do, these are what changes for you.
 */
export function RealBenefitsList({ compact = false }: { compact?: boolean }) {
  return (
    <Stagger
      className={`grid gap-x-8 sm:grid-cols-2 ${compact ? "gap-y-5 lg:grid-cols-3" : "gap-y-6"}`}
    >
      {REAL_BENEFITS.map((item, index) => (
        <StaggerItem key={item.key}>
          <div className={`flex gap-4 ${compact ? "" : "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"}`}>
            <span
              aria-hidden="true"
              className="font-display text-2xl font-extrabold leading-none tracking-tight text-teal-600/80 tabular-nums"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <h3 className="font-display text-[15px] font-bold text-slate-900">{item.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.line}</p>
              {!compact && (
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{item.detail}</p>
              )}
            </div>
          </div>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

/** A small heading inside a band, for the home page's stacked mission band. */
export function SubHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <Reveal className="mb-6 text-center sm:mb-8">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-700">{eyebrow}</p>
      <h3 className="font-display mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
        {title}
      </h3>
    </Reveal>
  );
}
