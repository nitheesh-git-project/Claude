import CatalogImage from "@/components/catalog/CatalogImage";
import type { CareIllustrationId } from "@/components/visuals/CareIllustration";

/**
 * The top of a catalog detail dialog: the photograph, then the heading.
 *
 * It replaces two different headers that had grown apart. The programme
 * dialog never read `image_url` at all -- it drew a teal panel with a vector
 * illustration -- so the moment admins could upload real photographs, a card
 * would show one and its own dialog a cartoon, one tap apart. The home-visit
 * dialog did show the photograph, but laid the heading over it, which costs a
 * scrim dark enough to survive any image and a heading sized to fight it.
 *
 * Neither happens here. **Nothing sits on the picture.** The photograph gets
 * the full 16:9 uncovered, and the heading goes on its own band underneath
 * where it can be ordinary dark-on-white type - which means a bright
 * photograph and a dark one are equally safe, and an admin can upload
 * whatever they have.
 *
 * The badge moves into that band for the same reason. It gains contrast and
 * loses a little prominence; that is the trade the clean picture buys.
 *
 * The frame keeps its 16:9 with no photograph set, so the dialog does not
 * change height depending on whether the catalogue has been filled in yet.
 */
export default function CatalogDialogHeader({
  titleId,
  title,
  eyebrow,
  badge,
  subtitle,
  imageUrl,
  focalX,
  focalY,
  art,
  icon,
}: {
  /** The id `Modal`'s `labelledBy` points at. */
  titleId: string;
  title: string;
  /** Small teal label above the title - a condition type, usually. */
  eyebrow?: string | null;
  /** Admin-set badge. Rendered instead of the eyebrow when both exist, since
   *  two labels stacked over one heading is noise. */
  badge?: string | null;
  subtitle?: string | null;
  imageUrl?: string | null;
  focalX?: number | null;
  focalY?: number | null;
  art?: CareIllustrationId;
  icon?: string;
}) {
  return (
    <>
      <div className="relative">
        <CatalogImage
          src={imageUrl}
          focalX={focalX}
          focalY={focalY}
          art={art}
          icon={icon}
          className="aspect-[16/9] h-auto"
        />
      </div>

      <div className="px-6 pt-5 sm:px-8">
        {badge ? (
          <span className="mb-2 inline-block rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-950">
            {badge}
          </span>
        ) : eyebrow ? (
          <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">
            {eyebrow}
          </span>
        ) : null}
        <h3
          id={titleId}
          className="font-display mt-1.5 text-2xl font-extrabold leading-tight text-slate-900 sm:text-[27px]"
        >
          {title}
        </h3>
        {subtitle && <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{subtitle}</p>}
      </div>

      {/* Separates the identity of the thing from the facts about it, so the
          body below does not read as one long run of text. */}
      <div className="mx-6 mt-5 h-px bg-slate-100 sm:mx-8" />
    </>
  );
}
