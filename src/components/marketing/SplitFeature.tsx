import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/motion/primitives";
import { photo, type PhotoId } from "@/lib/marketingPhotos";

/**
 * A photograph beside a short claim, with the picture doing most of the
 * explaining.
 *
 * Used for the handful of things a grid of cards genuinely cannot carry —
 * the two delivery modes, the hospital partnership — and nothing else. The
 * bullets are capped in practice at three because a fourth turns the band
 * back into the prose block this rewrite removed.
 */
export default function SplitFeature({
  eyebrow,
  title,
  body,
  bullets,
  photoId,
  alt,
  cta,
  reverse = false,
  badge,
}: {
  eyebrow?: string;
  title: string;
  body: string;
  bullets?: string[];
  photoId: PhotoId;
  alt: string;
  cta?: { href: string; label: string };
  /** Photo on the left instead of the right — alternate down a page. */
  reverse?: boolean;
  /** One word floated on the photo, e.g. the delivery mode. */
  badge?: string;
}) {
  const img = photo(photoId);

  return (
    <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
      <Reveal className={reverse ? "lg:order-2" : undefined}>
        <div className="relative overflow-hidden rounded-[1.5rem] bg-slate-100 shadow-[0_20px_48px_-28px_rgba(15,23,42,0.4)] ring-1 ring-slate-900/5">
          <Image
            src={img}
            alt={alt}
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="h-full w-full object-cover"
          />
          {badge && (
            <span className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-teal-800 shadow-sm backdrop-blur">
              {badge}
            </span>
          )}
        </div>
      </Reveal>

      <Reveal delay={0.1} className={reverse ? "lg:order-1" : undefined}>
        {eyebrow && (
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-700">
            {eyebrow}
          </p>
        )}
        <h3 className="font-display mt-3 text-2xl font-bold tracking-[-0.02em] text-slate-900 sm:text-3xl">
          {title}
        </h3>
        <p className="mt-4 text-[15px] leading-relaxed text-slate-600 sm:text-base">
          {body}
        </p>

        {bullets && bullets.length > 0 && (
          <ul className="mt-6 space-y-2.5">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-3 text-sm text-slate-600">
                <i
                  className="fa-solid fa-circle-check mt-0.5 text-teal-600"
                  aria-hidden="true"
                />
                {bullet}
              </li>
            ))}
          </ul>
        )}

        {cta && (
          <Link
            href={cta.href}
            className="group mt-7 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
          >
            {cta.label}
            <i
              className="fa-solid fa-arrow-right text-[11px] transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </Link>
        )}
      </Reveal>
    </div>
  );
}
