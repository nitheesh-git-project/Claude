import Image from "next/image";
import { Reveal, MotionButton } from "@/components/motion/primitives";
import { photo, type PhotoId } from "@/lib/marketingPhotos";

export type HeroStat = { value: string; label: string };
export type HeroCta = { href: string; label: string; icon?: string };

/**
 * The opening screen of every public page.
 *
 * All seven pages share it so the site reads as one product rather than
 * seven landing pages — the previous version gave each page its own hero
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
  /** Small card floated over the photo — one fact, never a paragraph. */
  overlay?: { icon: string; title: string; body: string };
  size?: "default" | "large";
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
        className={`relative mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:gap-14 lg:px-8 ${
          large ? "py-16 lg:py-24" : "py-14 lg:py-20"
        }`}
      >
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-teal-800">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
            {eyebrow}
          </span>

          <h1
            className={`font-display mt-5 font-extrabold leading-[1.04] tracking-[-0.035em] text-slate-900 ${
              large
                ? "text-[2.4rem] sm:text-[3.25rem] xl:text-[3.6rem]"
                : "text-[2.1rem] sm:text-[2.75rem] xl:text-5xl"
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

          {stats && stats.length > 0 && (
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-slate-200/80 pt-6">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <dt className="sr-only">{stat.label}</dt>
                  <dd>
                    <span className="font-display block text-xl font-bold text-slate-900 sm:text-2xl">
                      {stat.value}
                    </span>
                    <span className="mt-0.5 block text-xs font-medium text-slate-500">
                      {stat.label}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Reveal>

        <Reveal delay={0.12}>
          <div className="relative">
            <div className="relative overflow-hidden rounded-[1.75rem] bg-slate-100 shadow-[0_24px_64px_-24px_rgba(15,23,42,0.35)] ring-1 ring-slate-900/5">
              <Image
                src={img}
                alt={alt}
                // Preloaded, not lazy: this is the LCP element on every one
                // of these pages. `priority` is deprecated in Next 16.
                preload
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="h-full w-full object-cover"
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
      </div>

      {/* Breathing room for the overlay card, which hangs past the photo. */}
      {overlay && <div className="h-6" />}
    </div>
  );
}
