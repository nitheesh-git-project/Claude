import { describe, it, expect } from "vitest";
import { pickFeatured, countFeatured, FEATURED_LIMIT } from "./catalogFeatured";

const row = (id: string, featured?: boolean | null) => ({ id, featured });

describe("pickFeatured", () => {
  it("shows the ticked rows, in the order they arrive", () => {
    const { shown } = pickFeatured([row("a"), row("b", true), row("c"), row("d", true)]);
    expect(shown.map((r) => r.id)).toEqual(["b", "d"]);
  });

  it("falls back to the first rows when nothing is ticked", () => {
    // The case that decides whether shipping the column and the UI together
    // is safe: before an admin has opened the screen, every row is false.
    // An empty band reads as the clinic having shut.
    const rows = [row("a"), row("b"), row("c"), row("d"), row("e")];
    const { shown, hasMore } = pickFeatured(rows);
    expect(shown.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
    expect(hasMore).toBe(true);
  });

  it("caps at the limit when more are ticked than fit", () => {
    const rows = [row("a", true), row("b", true), row("c", true), row("d", true), row("e", true)];
    const { shown, hasMore } = pickFeatured(rows);
    expect(shown).toHaveLength(FEATURED_LIMIT);
    expect(hasMore).toBe(true);
  });

  it("offers no way to see more when there is nothing more to see", () => {
    // A button opening a list identical to the one above it is a dead end
    // with a label on it.
    const { shown, hasMore } = pickFeatured([row("a", true), row("b", true)]);
    expect(shown).toHaveLength(2);
    expect(hasMore).toBe(false);
  });

  it("says there is more when rows exist beyond the ticked ones", () => {
    const { shown, hasMore } = pickFeatured([row("a", true), row("b"), row("c")]);
    expect(shown.map((r) => r.id)).toEqual(["a"]);
    expect(hasMore).toBe(true);
  });

  it("treats a missing column as not featured rather than as true", () => {
    // A database one apply behind returns rows with no `featured` key at
    // all. Reading undefined as featured would put every row on the home
    // page; reading it as false falls through to the first four, which is
    // exactly what the page did before.
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }];
    expect(pickFeatured(rows).shown.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("handles an empty catalogue without inventing a button", () => {
    expect(pickFeatured([])).toEqual({ shown: [], hasMore: false });
  });

  it("honours an explicit limit", () => {
    const rows = [row("a", true), row("b", true), row("c", true)];
    expect(pickFeatured(rows, 2).shown.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("countFeatured", () => {
  it("counts only the ticked rows", () => {
    expect(countFeatured([row("a", true), row("b"), row("c", true), row("d", null)])).toBe(2);
  });

  it("is zero for a catalogue nobody has curated", () => {
    expect(countFeatured([{ id: "a" }, { id: "b" }])).toBe(0);
  });
});
