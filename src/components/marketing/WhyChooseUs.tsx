import Image from "next/image";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/primitives";
import { photo } from "@/lib/marketingPhotos";
import { REAL_BENEFITS, WHY_CHOOSE_US, type WhyItem } from "@/lib/whyChooseUs";

/**
 * "Why choose us" -- six reasons as a bento grid, each tile carrying a small
 * drawn vignette of the thing it describes (built from the site's own UI
 * parts, not stock art), so the band reads at a glance before a word of it
 * is read. `compact` (the home page) gives each one line; the full version
 * (/mission) adds how the platform does it. Copy: src/lib/whyChooseUs.ts.
 *
 * `languages` is the clinic's own booking-language list
 * (site_settings.booking_languages), so the language tile never offers one
 * the booking form does not.
 */
export function WhyChooseUsGrid({
  compact = false,
  languages,
}: {
  compact?: boolean;
  languages: string[];
}) {
  // Three rows of three columns: wide + narrow, narrow + wide, narrow + wide.
  const wide = new Set(["physios", "progress", "language"]);
  return (
    <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-5">
      {WHY_CHOOSE_US.map((item, index) => (
        <StaggerItem
          key={item.key}
          className={`h-full ${wide.has(item.key) ? "lg:col-span-2" : ""}`}
        >
          <div className="group flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-lg">
            <div
              aria-hidden="true"
              className={`relative flex h-36 items-center justify-center overflow-hidden ${TILE_BG[index % TILE_BG.length]}`}
            >
              <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/40 blur-2xl" />
              <Vignette item={item} languages={languages} />
            </div>
            <div className="flex flex-1 flex-col p-5 sm:p-6">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-xs text-white">
                  <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                </span>
                <h3 className="font-display text-base font-bold text-slate-900">{item.title}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.line}</p>
              {!compact && (
                <p className="mt-3 border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-500">
                  {item.detail}
                </p>
              )}
            </div>
          </div>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

const TILE_BG = [
  "bg-gradient-to-br from-teal-50 via-emerald-50 to-white",
  "bg-gradient-to-br from-sky-50 via-teal-50 to-white",
  "bg-gradient-to-br from-amber-50 via-orange-50/60 to-white",
  "bg-gradient-to-br from-emerald-50 via-teal-50 to-white",
  "bg-gradient-to-br from-violet-50 via-sky-50 to-white",
  "bg-gradient-to-br from-rose-50 via-amber-50/50 to-white",
];

const chip =
  "flex items-center gap-1.5 rounded-full border border-white bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm";

function Vignette({ item, languages }: { item: WhyItem; languages: string[] }) {
  switch (item.key) {
    case "physios":
      return (
        <div className="flex items-center gap-5">
          <div className="flex -space-x-3">
            {["AK", "PS", "RM", "NJ"].map((initials, i) => (
              <span
                key={initials}
                className={`flex h-12 w-12 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow ${
                  ["bg-teal-600", "bg-sky-600", "bg-emerald-600", "bg-violet-500"][i]
                }`}
              >
                {initials}
              </span>
            ))}
          </div>
          <div className="space-y-1.5">
            <span className={chip}>
              <i className="fa-solid fa-circle-check text-emerald-600" /> Credentials checked
            </span>
            <span className={chip}>
              <i className="fa-solid fa-id-badge text-teal-600" /> Profile you can read
            </span>
          </div>
        </div>
      );
    case "profile":
      return (
        <div className="w-44 space-y-1.5">
          {[
            ["fa-bone", "Orthopaedic", true],
            ["fa-brain", "Neurological", false],
            ["fa-child", "Paediatric", false],
          ].map(([icon, label, on]) => (
            <div
              key={label as string}
              className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold shadow-sm ${
                on ? "bg-teal-700 text-white" : "bg-white text-slate-600"
              }`}
            >
              <i className={`fa-solid ${icon} text-[10px]`} />
              {label}
              {on && <i className="fa-solid fa-check ml-auto text-[10px]" />}
            </div>
          ))}
        </div>
      );
    case "plan":
      return (
        <div className="w-48 rounded-2xl bg-white p-3 shadow-md">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Your plan</p>
          {[
            ["Glute bridges", true],
            ["Step-ups", true],
            ["Single-leg balance", false],
          ].map(([label, done]) => (
            <div key={label as string} className="mt-1.5 flex items-center gap-2 text-xs text-slate-700">
              <span
                className={`flex h-4 w-4 items-center justify-center rounded ${
                  done ? "bg-emerald-500 text-white" : "border border-slate-300"
                }`}
              >
                {done && <i className="fa-solid fa-check text-[8px]" />}
              </span>
              {label}
            </div>
          ))}
        </div>
      );
    case "progress":
      return (
        <div className="flex items-center gap-5">
          <svg viewBox="0 0 160 70" className="h-20 w-40">
            <defs>
              <linearGradient id="why-trend" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#14b8a6" stopOpacity="0.35" />
                <stop offset="1" stopColor="#14b8a6" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M5 12 L50 24 L100 40 L155 55 L155 68 L5 68 Z" fill="url(#why-trend)" />
            <path d="M5 12 L50 24 L100 40 L155 55" fill="none" stroke="#0f766e" strokeWidth="3" strokeLinecap="round" />
            {[
              [5, 12],
              [50, 24],
              [100, 40],
              [155, 55],
            ].map(([x, y]) => (
              <circle key={x} cx={x} cy={y} r="4" fill="#fff" stroke="#0f766e" strokeWidth="2.5" />
            ))}
          </svg>
          <div className="space-y-1.5">
            <span className={chip}>
              <i className="fa-solid fa-person-rays text-teal-600" /> Pain 7 → 3
            </span>
            <span className={chip}>
              <i className="fa-solid fa-notes-medical text-teal-600" /> 4 sessions noted
            </span>
          </div>
        </div>
      );
    case "modes":
      return (
        <div className="flex items-center gap-3">
          <span className="flex h-16 w-16 flex-col items-center justify-center rounded-2xl bg-white text-teal-700 shadow-md">
            <i className="fa-solid fa-video text-lg" />
            <span className="mt-1 text-[10px] font-semibold text-slate-500">Video</span>
          </span>
          <span className="text-xs font-bold text-slate-400">or</span>
          <span className="flex h-16 w-16 flex-col items-center justify-center rounded-2xl bg-white text-teal-700 shadow-md">
            <i className="fa-solid fa-house-medical text-lg" />
            <span className="mt-1 text-[10px] font-semibold text-slate-500">At home</span>
          </span>
        </div>
      );
    case "language":
      // The clinic's own list, however short: a speech bubble carries the
      // tile when only one language is offered.
      return (
        <div className="flex items-center gap-4">
          <div className="relative rounded-2xl rounded-bl-sm bg-white px-4 py-3 shadow-md">
            <p className="text-xs font-semibold text-slate-800">&ldquo;It hurts when I climb stairs.&rdquo;</p>
            <p className="mt-1 text-[10px] text-slate-400">Said the way you would say it</p>
          </div>
          <div className="flex max-w-[11rem] flex-wrap gap-1.5">
            {languages.slice(0, 4).map((language, i) => (
              <span
                key={language}
                className={`rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${
                  i === 0 ? "bg-teal-700 text-white" : "bg-white text-slate-600"
                }`}
              >
                {language}
              </span>
            ))}
          </div>
        </div>
      );
    default:
      return <i className={`fa-solid ${item.icon} text-4xl text-teal-600/70`} />;
  }
}

/**
 * "The real benefits" -- a photograph of recovery at home, with two facts
 * floating on it, beside the six benefits as illustrated rows. Numbered as
 * well as iconed so it reads as a different kind of list from the reasons
 * above it: those are what we do, these are what changes for you.
 */
export function RealBenefitsList({ compact = false }: { compact?: boolean }) {
  const img = photo("care-mobility");
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
      <Reveal className="relative">
        <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] shadow-xl sm:aspect-[4/3] lg:aspect-[4/5]">
          <Image
            src={img}
            alt="An older couple on their sofa, smiling at a tablet"
            fill
            sizes="(min-width: 1024px) 40vw, 100vw"
            className="object-cover"
            placeholder="blur"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 via-transparent to-transparent" />
        </div>
        <div className="absolute -left-3 top-6 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-lg sm:-left-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <i className="fa-solid fa-route" aria-hidden="true" />
          </span>
          <div>
            <p className="font-display text-sm font-bold text-slate-900">0 km to travel</p>
            <p className="text-[11px] text-slate-500">on a video session</p>
          </div>
        </div>
        <div className="absolute -right-3 bottom-6 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-lg sm:-right-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <i className="fa-solid fa-user-doctor" aria-hidden="true" />
          </span>
          <div>
            <p className="font-display text-sm font-bold text-slate-900">1 physiotherapist</p>
            <p className="text-[11px] text-slate-500">all the way through</p>
          </div>
        </div>
      </Reveal>

      <Stagger className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        {REAL_BENEFITS.map((item, index) => (
          <StaggerItem key={item.key} className="h-full">
            <div className="group flex h-full gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-200 hover:shadow-md sm:p-5">
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl text-base text-white shadow-sm ${BENEFIT_BG[index % BENEFIT_BG.length]}`}
                >
                  <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                </span>
                <span className="mt-2 text-[10px] font-bold tabular-nums text-slate-300">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <div>
                <h3 className="font-display text-[15px] font-bold text-slate-900">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.line}</p>
                {!compact && <p className="mt-2 text-sm leading-relaxed text-slate-500">{item.detail}</p>}
              </div>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}

const BENEFIT_BG = [
  "bg-gradient-to-br from-teal-500 to-emerald-600",
  "bg-gradient-to-br from-sky-500 to-teal-600",
  "bg-gradient-to-br from-violet-500 to-sky-600",
  "bg-gradient-to-br from-amber-500 to-orange-500",
  "bg-gradient-to-br from-emerald-500 to-teal-600",
  "bg-gradient-to-br from-rose-500 to-amber-500",
];

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
