import CareIllustration, {
  type CareIllustrationId,
} from "@/components/visuals/CareIllustration";

/**
 * The cover image slot on a catalog card — programme, session package or
 * home-visit package.
 *
 * All three are admin-created rows with a nullable `image_url`, so all three
 * need an answer for "no photo yet", and they each had a different one: the
 * programme cards drew a small vector illustration in a tinted square, the
 * package cards filled a mint block with one oversized icon, and nothing
 * agreed on height. On a page where two of them sit one band apart, that read
 * as three different components rather than one catalog.
 *
 * So the fallback is a designed state, not a broken one: the same tinted
 * panel, the same height, and the row's own illustration at a size that looks
 * deliberate. A card with no photograph should look like a card whose photo
 * has not been chosen yet — never like a card whose image failed to load.
 *
 * `src` is an admin-supplied URL rendered through a plain <img>, not
 * next/image: optimising it would mean maintaining a remotePatterns allowlist
 * for every host an admin might paste from, and the point of the field is
 * that they can paste any of them.
 */
export default function CatalogImage({
  src,
  alt = "",
  art,
  icon = "fa-layer-group",
  className = "h-40",
}: {
  src?: string | null;
  /**
   * Left empty by default. These are decorative covers beside a heading that
   * already names the programme, and an admin pasting a URL has nowhere to
   * describe it — inventing alt text from the title would just repeat the
   * heading to a screen reader.
   */
  alt?: string;
  /** Vector fallback, when the card has an illustration of its own. */
  art?: CareIllustrationId;
  /** Icon fallback, for cards that do not. */
  icon?: string;
  /** Height utility — cards in one grid must pass the same one. */
  className?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} className={`w-full object-cover ${className}`} />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`flex w-full items-center justify-center bg-gradient-to-br from-teal-50 via-teal-50/60 to-emerald-50 ${className}`}
    >
      {art ? (
        <CareIllustration id={art} className="h-3/5 w-auto text-teal-600/70" />
      ) : (
        <i className={`fa-solid ${icon} text-4xl text-teal-300`} />
      )}
    </div>
  );
}
