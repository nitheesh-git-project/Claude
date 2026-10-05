import Link from "@/components/system/ProgressLink";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import type { ShowcaseProfile } from "@/lib/healthProfileShowcase";

/**
 * The home page's "Built for your kind of care" band: one card per enabled
 * specialty, each with the change its sample profile tracks, linking to the
 * full showcase on /how-it-works. The figures are the showcase's sample, and
 * the band says so -- they illustrate what is measured, not a result.
 */
export default function HealthProfileBand({ profiles }: { profiles: ShowcaseProfile[] }) {
  return (
    <>
      <Stagger className={`grid gap-5 ${profiles.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        {profiles.map((p) => (
          <StaggerItem key={p.specialty} className="h-full">
            <Link
              href={`/how-it-works?profile=${p.specialty}#health-profile`}
              className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700 transition group-hover:bg-teal-700 group-hover:text-white">
                <i className={`fa-solid ${p.icon}`} aria-hidden="true" />
              </span>
              <p className="mt-4 font-display text-[15px] font-bold text-slate-900">{p.label}</p>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-500">{p.forWho}</p>
              <div className="mt-5 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-xs font-semibold text-slate-500">{p.headline.metric}</span>
                <span className="font-display text-sm font-bold text-slate-900">
                  <span className="text-slate-400">{p.headline.from}</span>
                  <i className="fa-solid fa-arrow-right mx-2 text-[10px] text-teal-600" aria-hidden="true" />
                  <span className="text-emerald-700">{p.headline.to}</span>
                </span>
              </div>
            </Link>
          </StaggerItem>
        ))}
      </Stagger>
      <p className="mt-6 text-center text-xs text-slate-500">
        Example figures from a sample profile, to show what is measured.{" "}
        <Link href="/how-it-works#health-profile" className="font-semibold text-teal-700 hover:underline">
          See how we track your progress →
        </Link>
      </p>
    </>
  );
}
