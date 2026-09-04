/**
 * How wide each Explore tile is, so the last row never trails off into empty
 * white space.
 *
 * The band is a fixed three-across grid, and the number of tiles in it is
 * not a fixed number: it is every page except the one being read, minus Home
 * Visit when the clinic has switched it off. Seven page tiles in three
 * columns leaves the seventh alone with two empty cells beside it, which
 * reads as a missing card rather than as the end of the list.
 *
 * The fix is arithmetic rather than a hand-placed exception, because the
 * count changes: eight pages today, one of them conditional, and a ninth
 * would land the gap somewhere else entirely.
 *
 * **Six columns at the large breakpoint, not three.** A tile normally spans
 * two of them, which is the same three-across layout — but it means a row
 * with two tiles left over can give each of them half the row. In a literal
 * three-column grid those two would have to be 1.5 columns each, which is
 * not a thing, so the only options would be a gap or a full-width pair.
 *
 * Booking is excluded from the arithmetic on purpose: it is the action
 * rather than another page to read, it is always last, and it always takes
 * the whole final row.
 */

/** Tailwind classes for one tile's column span at each breakpoint. */
export type TileSpan = {
  /** The grid-column classes for this tile. */
  className: string;
  /**
   * True when the tile fills the whole row at **every** breakpoint where the
   * grid has more than one column. Only then does the photo-beside-text
   * layout make sense: a tile that is full width on a tablet and half width
   * on a desktop would have to change shape between the two.
   */
  fullRow: boolean;
};

/** Base (mobile) is a single column, so nothing there can ever leave a gap. */
const NORMAL = "sm:col-span-1 lg:col-span-2";

export function exploreTileSpans(pageTileCount: number): TileSpan[] {
  const spans: TileSpan[] = [];
  // How many tiles are stranded on the last row of each layout.
  const strandedAtSm = pageTileCount % 2;
  const strandedAtLg = pageTileCount % 3;

  for (let i = 0; i < pageTileCount; i++) {
    const fromEnd = pageTileCount - i;
    // At two columns there is only ever one odd tile, and it takes both.
    const smFull = strandedAtSm === 1 && fromEnd === 1;
    // At six columns: one stranded tile takes all six; two stranded tiles
    // take three each, so the row is half and half rather than a third empty.
    const lgFull = strandedAtLg === 1 && fromEnd === 1;
    const lgHalf = strandedAtLg === 2 && fromEnd <= 2;

    const sm = smFull ? "sm:col-span-2" : "sm:col-span-1";
    const lg = lgFull ? "lg:col-span-6" : lgHalf ? "lg:col-span-3" : "lg:col-span-2";

    spans.push({
      className: `${sm} ${lg}`,
      // Deliberately strict: full at sm AND full at lg. The half-width case
      // is a normal card that happens to be wider, and switching its
      // internal layout at one breakpoint only would look like two designs.
      fullRow: smFull && lgFull,
    });
  }

  return spans;
}

/** Booking's own span: the whole final row, at every breakpoint. */
export const BOOK_TILE_SPAN = "sm:col-span-2 lg:col-span-6";

export { NORMAL as EXPLORE_TILE_SPAN_DEFAULT };
