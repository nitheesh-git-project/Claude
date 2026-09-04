import { Stagger, StaggerItem } from "@/components/motion/primitives";
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
 * and it always ends on Book a session -- on every public page, not only the
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
    // Six columns rather than three at the large breakpoint: a normal tile
    // spans two of them, which is the same three-across layout, but it lets
    // a row with two tiles left over give each of them half the row instead
    // of leaving a third of it blank. See exploreGridSpans.ts.
    <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-6">
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
  );
}
