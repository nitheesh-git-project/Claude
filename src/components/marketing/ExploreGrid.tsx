import { Stagger, StaggerItem } from "@/components/motion/primitives";
import Link from "@/components/system/ProgressLink";
import PhotoTile from "@/components/marketing/PhotoTile";
import { BOOK_CONNECTOR, type MarketingConnector } from "@/lib/marketingNav";
import { BOOK_TILE_SPAN, exploreTileSpans } from "@/lib/exploreGridSpans";

/**
 * The site's index, as photographs.
 *
 * This is the connector band the home page scrolls down into, and the strip
 * at the foot of the other six pages. It exists because the header nav asks
 * a visitor to guess what "Conditions Treated" or "How It Works" contains
 * from two words and no picture; here every destination shows what it is and
 * says why you would open it, so nobody has to guess their way around the
 * site to find the one page that answers their question.
 *
 * The list comes from `marketingNav.ts` rather than being written out here,
 * so a page cannot be added to the site and quietly left out of its index,
 * and it always ends on Book a video session -- on every public page, not only
 * home one. Wherever a visitor stops reading, the next step is in the same
 * place.
 *
 * The row-squaring arithmetic is in `exploreGridSpans.ts`: the tile count
 * varies (one page is always missing, and Home Visit may be switched off),
 * so which row ends short is not something a hand-placed exception can know.
 */
export default function ExploreGrid({
  connectors,
}: {
  connectors: MarketingConnector[];
}) {
  // Booking is always last and always takes the whole final row, so it is
  // kept out of the arithmetic that squares up the rows above it.
  const bookIndex = connectors.findIndex((c) => c.key === BOOK_CONNECTOR.key);
  const pageTiles = bookIndex === -1 ? connectors : connectors.filter((_, i) => i !== bookIndex);
  const book = bookIndex === -1 ? null : connectors[bookIndex];
  const spans = exploreTileSpans(pageTiles.length);

  return (
    <>
      {/* On a phone the eight photographs were eight screens of scrolling
          to reach a list of page names. Below sm the band is compact rows --
          an icon, the name and one line -- each a full-width 56px target, and
          the photograph grid takes over from sm. */}
      <ul className="space-y-2 sm:hidden">
        {connectors.map((connector) => {
          const isBook = connector.key === BOOK_CONNECTOR.key;
          return (
            <li key={connector.key}>
              <Link
                href={connector.href}
                className={`flex min-h-14 items-center gap-3 rounded-2xl border px-4 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                  isBook
                    ? "border-teal-700 bg-teal-700 text-white"
                    : "border-slate-200 bg-white text-slate-900 hover:border-teal-300"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    isBook ? "bg-white/15 text-white" : "bg-teal-50 text-teal-700"
                  }`}
                >
                  <i className={`fa-solid ${connector.icon}`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold leading-tight">{connector.label}</span>
                  <span
                    className={`block text-sm leading-snug ${isBook ? "text-teal-50" : "text-slate-600"}`}
                  >
                    {connector.blurb}
                  </span>
                </span>
                <i
                  aria-hidden="true"
                  className={`fa-solid fa-chevron-right text-xs ${isBook ? "text-white" : "text-slate-400"}`}
                />
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Six columns rather than three at the large breakpoint: a normal tile
          spans two of them, which is the same three-across layout, but it lets
          a row with two tiles left over give each of them half the row instead
          of leaving a third of it blank. See exploreGridSpans.ts. */}
    <Stagger className="hidden gap-5 sm:grid sm:grid-cols-2 lg:grid-cols-6">
      {pageTiles.map((connector, i) => (
        <StaggerItem key={connector.key} className={`h-full ${spans[i].className}`}>
          <PhotoTile
            // Photo beside the text only when the tile fills the row at
            // every breakpoint that has more than one column -- a card that
            // changed shape between tablet and desktop would read as two
            // different designs rather than one stretched tile.
            wide={spans[i].fullRow}
            href={connector.href}
            photoId={connector.photo}
            alt={connector.photoAlt}
            title={connector.label}
            blurb={connector.blurb}
            action={connector.action}
            icon={connector.icon}
          />
        </StaggerItem>
      ))}

      {book && (
        <StaggerItem key={book.key} className={`h-full ${BOOK_TILE_SPAN}`}>
          <PhotoTile
            wide
            href={book.href}
            photoId={book.photo}
            alt={book.photoAlt}
            title={book.label}
            blurb={book.blurb}
            action={book.action}
            icon={book.icon}
          />
        </StaggerItem>
      )}
    </Stagger>
    </>
  );
}
