import { describe, it, expect } from "vitest";
import { sortFeed, countNeedsYou, type FeedItem } from "@/lib/dashboardFeed";

function item(id: string, at: string, needsYou = false): FeedItem {
  return { id, at, icon: "fa-circle", tone: "info", title: id, needsYou };
}

describe("sortFeed", () => {
  it("pins what is waiting on the viewer above what is merely recent", () => {
    // The case that exposed this: a programme paid for a month ago with
    // sessions still unbooked dates from the payment, so sorting purely by
    // date sank it further the longer it went unanswered.
    const sorted = sortFeed([
      item("recent-news", "2026-09-02T10:00:00Z"),
      item("old-but-yours", "2026-08-01T10:00:00Z", true),
    ]);
    expect(sorted[0].id).toBe("old-but-yours");
  });

  it("still reads newest first inside each group", () => {
    const sorted = sortFeed([
      item("older-need", "2026-08-01T10:00:00Z", true),
      item("newer-need", "2026-09-01T10:00:00Z", true),
      item("older-news", "2026-07-01T10:00:00Z"),
      item("newer-news", "2026-09-02T10:00:00Z"),
    ]);
    expect(sorted.map((i) => i.id)).toEqual([
      "newer-need",
      "older-need",
      "newer-news",
      "older-news",
    ]);
  });

  it("drops items with no timestamp rather than sorting them to one end", () => {
    expect(sortFeed([item("no-date", ""), item("dated", "2026-09-01T10:00:00Z")])).toHaveLength(1);
  });

  it("honours the limit", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      item(`i${i}`, new Date(Date.UTC(2026, 8, i + 1)).toISOString())
    );
    expect(sortFeed(many)).toHaveLength(12);
    expect(sortFeed(many, 3)).toHaveLength(3);
  });

  it("counts only what is waiting on the viewer", () => {
    expect(
      countNeedsYou([item("a", "2026-09-01T10:00:00Z", true), item("b", "2026-09-02T10:00:00Z")])
    ).toBe(1);
  });
});
