import { describe, it, expect } from "vitest";
import { exploreTileSpans } from "./exploreGridSpans";

// The grid is 1 / 2 / 6 columns and a normal tile spans 1 / 1 / 2, so "the
// row is full" means the spans across a row add up to the column count.
function rowsAreFull(count: number, cols: 2 | 6): boolean {
  const spans = exploreTileSpans(count);
  const width = (i: number) => {
    const c = spans[i].className;
    if (cols === 2) return c.includes("sm:col-span-2") ? 2 : 1;
    if (c.includes("lg:col-span-6")) return 6;
    if (c.includes("lg:col-span-3")) return 3;
    return 2;
  };
  let filled = 0;
  for (let i = 0; i < count; i++) {
    filled += width(i);
    if (filled === cols) filled = 0;
    else if (filled > cols) return false;
  }
  // Anything left over is a part-filled last row: a gap.
  return filled === 0;
}

describe("exploreTileSpans", () => {
  it("gives every tile a span", () => {
    expect(exploreTileSpans(7)).toHaveLength(7);
    expect(exploreTileSpans(0)).toHaveLength(0);
  });

  // The counts this band can actually produce: eight pages, minus the one
  // being read, minus Home Visit when it is switched off.
  it.each([1, 2, 3, 4, 5, 6, 7, 8])("leaves no gap at two columns with %i tiles", (n) => {
    expect(rowsAreFull(n, 2)).toBe(true);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])("leaves no gap at six columns with %i tiles", (n) => {
    expect(rowsAreFull(n, 6)).toBe(true);
  });

  it("stretches the one stranded tile across the row", () => {
    // 7 = two full rows of three, then one on its own.
    const spans = exploreTileSpans(7);
    expect(spans[6].className).toContain("lg:col-span-6");
    expect(spans[6].className).toContain("sm:col-span-2");
    expect(spans[6].fullRow).toBe(true);
    // ...and leaves the six above it alone.
    for (const s of spans.slice(0, 6)) {
      expect(s.className).toBe("sm:col-span-1 lg:col-span-2");
      expect(s.fullRow).toBe(false);
    }
  });

  it("splits two stranded tiles in half rather than stretching either", () => {
    // 5 = one full row of three, then two.
    const spans = exploreTileSpans(5);
    expect(spans[3].className).toContain("lg:col-span-3");
    expect(spans[4].className).toContain("lg:col-span-3");
    // Half at lg, so never the photo-beside-text layout even though the
    // fifth tile is full width at the two-column breakpoint.
    expect(spans[3].fullRow).toBe(false);
    expect(spans[4].fullRow).toBe(false);
  });

  it("changes nothing when the count already fills every row", () => {
    for (const s of exploreTileSpans(6)) {
      expect(s.className).toBe("sm:col-span-1 lg:col-span-2");
      expect(s.fullRow).toBe(false);
    }
  });
});
