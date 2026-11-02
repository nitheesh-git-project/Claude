import Link from "@/components/system/ProgressLink";
import { Reveal } from "@/components/motion/primitives";
import { SAMPLE_NOTE, type ShowcaseProfile } from "@/lib/healthProfileShowcase";

/**
 * The home page's Health Profile band, shrunk to its one idea.
 *
 * The full tour (tabs per kind of care, the real graph and milestone cards)
 * is heavy and long, and on a phone it sat between "how it works" and the
 * programmes a visitor came to price. The home page now shows only the
 * headline change -- one sample patient's first-visit-to-latest figure, in the
 * same words the tour opens with -- and sends anyone curious to
 * /how-it-works, where the full showcase stays. It is a Server Component with
 * no panels, so the home page also stops shipping the tour's chunks.
 *
 * The invented patient is labelled as a sample on the card itself, and the
 * wording says what a profile *shows*, never what treatment will achieve.
 */
export default function HealthProfileTeaser({ profile }: { profile: ShowcaseProfile }) {
  return (
    <Reveal className="mx-auto max-w-3xl">
      <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_48px_-32px_rgba(15,23,42,0.25)] sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <i className={`fa-solid ${profile.icon}`} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-lg font-bold leading-tight text-slate-900">{profile.label}</h3>
              <p className="mt-0.5 text-base text-slate-700">{profile.forWho}</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
            {SAMPLE_NOTE}
          </span>
        </div>

        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-emerald-800">
            {profile.sample.name}: first visit to latest
          </p>
          <p className="mt-1 text-base font-semibold text-slate-900">{profile.headline.metric}</p>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 font-display text-3xl font-extrabold leading-tight text-emerald-800">
            <span>{profile.headline.from}</span>
            <i className="fa-solid fa-arrow-right text-base" aria-hidden="true" />
            <span className="sr-only">to</span>
            <span>{profile.headline.to}</span>
          </p>
          <p className="mt-1 text-sm text-slate-700">{profile.sample.line}</p>
        </div>

        <div className="mt-5 flex justify-center">
          <Link
            href="/how-it-works#health-profile"
            className="inline-flex min-h-11 items-center gap-2 text-base font-semibold text-teal-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          >
            See the full health profile
            <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </Reveal>
  );
}
