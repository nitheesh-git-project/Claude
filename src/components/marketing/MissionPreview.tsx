import Link from "next/link";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/primitives";
import { MISSION, VISION, PRINCIPLES } from "@/lib/mission";

/**
 * Why the practice exists, on the home page, above "what we treat".
 *
 * Placed before the conditions band on purpose: a visitor deciding whether to
 * trust a clinic they cannot walk into asks "who are you" before "do you
 * treat my back", and the old home page never answered the first question at
 * all.
 *
 * Only the mission and the vision are given in full here — they are two
 * sentences, and paraphrasing them into a teaser would leave the home page
 * making a weaker version of the same claim. Everything else is a headline
 * that links through: the four promises appear as their titles only, and
 * their bodies stay on `/mission`. That is the split that keeps this a
 * connector rather than a second copy of the page.
 *
 * Both halves read from `src/lib/mission.ts`, so the home page cannot end up
 * quoting a mission the mission page has since reworded.
 */
export default function MissionPreview() {
  return (
    <div>
      <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-2">
        <Reveal>
          <div className="h-full rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-700">
              Mission
            </p>
            <p className="font-display mt-4 text-lg font-semibold leading-relaxed tracking-[-0.01em] text-slate-900 sm:text-xl">
              {MISSION}
            </p>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="h-full rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-emerald-50/60 p-7 shadow-sm sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-700">
              Vision
            </p>
            <p className="font-display mt-4 text-lg font-semibold leading-relaxed tracking-[-0.01em] text-slate-900 sm:text-xl">
              {VISION}
            </p>
          </div>
        </Reveal>
      </div>

      {/* The promises as headlines only. Each one is its own link so the
          answer is a tap away from whichever promise caught the eye, and they
          all land on the band that explains them rather than the top of the
          page. */}
      <Reveal className="mx-auto mt-10 max-w-5xl">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
          What we promise
        </p>
      </Reveal>

      <Stagger className="mx-auto mt-4 flex max-w-5xl flex-wrap justify-center gap-2.5">
        {PRINCIPLES.map((item) => (
          <StaggerItem key={item.key}>
            <Link
              href="/mission#what-we-promise"
              className="group flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-teal-300 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
            >
              <i
                className={`fa-solid ${item.icon} text-xs text-teal-600`}
                aria-hidden="true"
              />
              {item.title}
            </Link>
          </StaggerItem>
        ))}
      </Stagger>

      <Reveal className="mt-10 text-center">
        <Link
          href="/mission"
          className="group inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
        >
          Read our mission
          <i
            className="fa-solid fa-arrow-right text-[11px] transition-transform group-hover:translate-x-1"
            aria-hidden="true"
          />
        </Link>
      </Reveal>
    </div>
  );
}
