import Image from "next/image";
import { Reveal, MotionButton } from "@/components/motion/primitives";
import { photo, type PhotoId } from "@/lib/marketingPhotos";

/** `value` is a node so a price can be a `<Price>`, which follows the
 *  visitor's currency. */
export type HeroStat = { value: React.ReactNode; label: string };
export type HeroCta = { href: string; label: string; icon?: string };

/**
 * The opening screen of every public page.
 *
 * All seven pages share it so the site reads as one product rather than
 * seven landing pages - the previous version gave each page its own hero
 * shape, which is part of why moving between them felt like moving between
 * different sites.
 *
 * The photograph is the load-bearing part, not decoration: a visitor should
 * be able to tell what this page is about with the text blurred out. That is
 * why `photo` and `alt` are required rather than optional, and why the alt
 * text describes the care being delivered rather than naming the file.
 */
export default function PageHero({
  eyebrow,
  title,
  subtitle,
  primary,
  secondary,
  stats,
  photoId,
  alt,
  overlay,
  size = "default",
  extras,
  shortPhotoOnMobile = false,
}: {
  eyebrow: string;
  title: React.ReactNode;
  /** Under 25 words. The hero answers "what is this", not "everything". */
  subtitle: string;
  primary?: HeroCta;
  secondary?: HeroCta;
  stats?: HeroStat[];
  photoId: PhotoId;
  alt: string;
  /** Small card floated over the photo - one fact, never a paragraph. */
  overlay?: { icon: string; title: string; body: string };
  size?: "default" | "large";
  /** Under the buttons: tappable chips, a "WhatsApp us" line, an inline
   *  pincode box. One short row, never a paragraph. */
  extras?: React.ReactNode;
  /** On a phone, crop the photograph to a short 16:9 band so the figures
   *  below it stay in the first screens. From lg it is the full photograph. */
  shortPhotoOnMobile?: boolean;
}) {
  const img = photo(photoId);
  const large = size === "large";

  return (
    <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-b from-teal-50/80 via-white to-white">
      {/* Two soft washes rather than the old animated orbs: the hero now
          carries a photograph, and moving shapes behind it competed with
          the one thing the visitor is meant to look at. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 -top-40 h-96 w-96 rounded-full bg-teal-200/30 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 top-32 h-80 w-80 rounded-full bg-emerald-100/40 blur-3xl"
      />

      <div
        // Copy column slightly wider than the photo: at 1280-1536px an even
        // split wrapped every hero headline onto an extra line.
        className={`relative mx-auto grid max-w-7xl items-center gap-8 px-4 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:gap-x-14 lg:gap-y-8 lg:px-8 ${
          large ? "py-12 sm:py-16 lg:py-20" : "py-12 sm:py-14 lg:py-20"
        }`}
      >
        {/* Three blocks in a grid rather than two columns: on a phone the
            order is words, photograph, figures (the photograph used to sit
            under the figures, a full screen below the buttons); from lg the
            figures return under the words and the photograph spans both. */}
        <Reveal className="lg:col-start-1 lg:row-start-1 lg:self-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-teal-800">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
            {eyebrow}
          </span>

          <h1
            // Sized so the home headline sits on three lines beside the
            // photograph from 1024px up; at 3.6rem it took four and pushed
            // the figures below the fold.
            className={`font-display mt-5 font-extrabold leading-[1.05] tracking-[-0.03em] text-slate-900 text-balance ${
              large
                ? "text-[2.25rem] sm:text-[3rem] xl:text-[3.25rem]"
                : "text-[2rem] sm:text-[2.6rem] xl:text-[2.9rem]"
            }`}
          >
            {title}
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
            {subtitle}
          </p>

          {(primary || secondary) && (
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {primary && (
                <MotionButton href={primary.href} variant="primary">
                  {primary.icon && <i className={`fa-solid ${primary.icon}`} />}
                  {primary.label}
                </MotionButton>
              )}
              {secondary && (
                <MotionButton href={secondary.href} variant="secondary">
                  {secondary.icon && (
                    <i className={`fa-solid ${secondary.icon} text-teal-600`} />
                  )}
                  {secondary.label}
                </MotionButton>
              )}
            </div>
          )}

          {extras}

          {/* From lg the figures close the copy column (see the photograph's
              note); on a phone they follow the photograph instead. */}
          {stats && stats.length > 0 && (
            <div className="mt-8 hidden lg:block">
              <HeroStats stats={stats} />
            </div>
          )}
        </Reveal>

        {/* The photograph keeps its own landscape shape (a stretched crop lost
            the laptop, and every photo here has to show the screen) and is
            centred against the copy column, which from lg carries the
            figures too: the two columns are one pair, so the hero no longer
            ends on a gap under whichever side was shorter. */}
        <Reveal delay={0.12} className="lg:col-start-2 lg:row-start-1 lg:self-center">
          <div className="relative">
            <div className={`relative overflow-hidden rounded-[1.75rem] bg-slate-100 shadow-[0_24px_64px_-24px_rgba(15,23,42,0.35)] ring-1 ring-slate-900/5 ${
                shortPhotoOnMobile ? "aspect-[16/9] lg:aspect-auto" : ""
              }`}>
              <Image
                src={img}
                alt={alt}
                // Preloaded, not lazy: this is the LCP element on every one
                // of these pages. `priority` is deprecated in Next 16.
                preload
                sizes="(max-width: 1024px) 100vw, 50vw"
                // The short phone/tablet band is a centre crop of a 4:3
                // photograph, which cut the laptop off: anchored lower, the
                // screen stays in frame with the face.
                className={`h-full w-full object-cover ${
                  shortPhotoOnMobile ? "object-[50%_68%] lg:object-center" : ""
                }`}
              />
            </div>

            {overlay && (
              <div className="absolute -bottom-5 left-4 right-4 rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-lg backdrop-blur sm:left-6 sm:right-auto sm:max-w-xs">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                    <i className={`fa-solid ${overlay.icon} text-sm`} />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{overlay.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                      {overlay.body}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Reveal>

        {stats && stats.length > 0 && (
          <Reveal delay={0.06} className="lg:hidden">
            <HeroStats stats={stats} />
          </Reveal>
        )}
      </div>

      {/* Breathing room for the overlay card, which hangs past the photo. */}
      {overlay && <div className="h-6" />}
    </div>
  );
}

/** The figures under a hero, as one strip of equal cells. */
function HeroStats({ stats }: { stats: HeroStat[] }) {
  // One strip of equal cells, so the figures read as one line. Columns
  // follow the count (the home page's third is a real rating, and there is
  // not always one to quote). Each cell is a reversed column -- dt before
  // dd, as a definition list requires, value drawn first -- and
  // `justify-end` is what keeps the values on one line: a reversed column
  // stacks from the bottom, so a label that wrapped lifted its own value
  // above the others. Labels are short enough not to wrap at 360px.
  return (
    <dl
      className={`grid max-w-xl divide-x divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur ${
        stats.length >= 3 ? "grid-cols-3" : "grid-cols-2"
      }`}
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex min-w-0 flex-col-reverse justify-end px-3 py-3 sm:px-5 sm:py-4"
        >
          <dt className="mt-0.5 block truncate text-xs font-medium text-slate-500 sm:text-sm">
            {stat.label}
          </dt>
          <dd className="font-display block whitespace-nowrap text-lg font-bold leading-tight text-slate-900 sm:text-2xl">
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
