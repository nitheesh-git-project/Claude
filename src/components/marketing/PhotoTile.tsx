import Image from "next/image";
import Link from "next/link";
import { photo, type PhotoId } from "@/lib/marketingPhotos";

/**
 * A photograph that is also a link — the unit the redesigned pages are built
 * from.
 *
 * The whole card is one `<Link>` and the "action" line is a span styled to
 * look like one, never a nested anchor: a link inside a link is invalid
 * markup and each browser resolves the click differently. Where a card needs
 * a *second* destination (the catalog cards, which open a dialog and also
 * link to checkout) that already has its own component — see
 * `ProgramCards` — and this one deliberately stays single-purpose.
 *
 * `blurb` is one line by contract. These grids exist to let someone scan six
 * things in a few seconds; a card that needs a paragraph belongs in a band of
 * its own.
 */
export default function PhotoTile({
  href,
  photoId,
  alt,
  title,
  blurb,
  action,
  icon,
  aspect = "4/3",
  wide = false,
}: {
  href: string;
  photoId: PhotoId;
  alt: string;
  title: string;
  blurb: string;
  action?: string;
  icon?: string;
  aspect?: "4/3" | "3/2" | "16/9";
  /**
   * Photo beside the text instead of above it, filling a whole grid row.
   * Used for the one card in a grid that is the action rather than another
   * page to read — a lone tile left over on the last row reads as a mistake,
   * and this makes the odd one out look deliberate.
   */
  wide?: boolean;
}) {
  const img = photo(photoId);

  return (
    <Link
      href={href}
      className={`group flex h-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-teal-200 hover:shadow-[0_20px_40px_-24px_rgba(15,23,42,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 ${
        wide ? "flex-col sm:flex-row sm:items-stretch" : "flex-col"
      }`}
    >
      <div
        className={`relative overflow-hidden bg-slate-100 ${
          wide ? "sm:w-2/5 sm:shrink-0" : ""
        }`}
        style={wide ? undefined : { aspectRatio: aspect.replace("/", " / ") }}
      >
        <Image
          src={img}
          alt={alt}
          fill={!wide}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className={`object-cover transition-transform duration-500 group-hover:scale-[1.04] ${
            wide ? "h-48 w-full sm:absolute sm:inset-0 sm:h-full" : ""
          }`}
        />
        {icon && (
          <span className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white/95 text-teal-700 shadow-sm backdrop-blur">
            <i className={`fa-solid ${icon} text-sm`} aria-hidden="true" />
          </span>
        )}
      </div>

      <div className={`flex flex-1 flex-col p-5 ${wide ? "justify-center sm:p-8" : ""}`}>
        <h3
          className={`font-display font-bold text-slate-900 ${
            wide ? "text-lg sm:text-xl" : "text-base"
          }`}
        >
          {title}
        </h3>
        <p
          className={`mt-1.5 text-sm leading-relaxed text-slate-500 ${
            wide ? "" : "flex-1"
          }`}
        >
          {blurb}
        </p>
        {action && (
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700">
            {action}
            <i
              className="fa-solid fa-arrow-right text-[11px] transition-transform duration-300 group-hover:translate-x-1"
              aria-hidden="true"
            />
          </span>
        )}
      </div>
    </Link>
  );
}
