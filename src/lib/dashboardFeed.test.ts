import { describe, it, expect } from "vitest";
import {
  buildAdminFeed,
  queueRollup,
  sortFeed,
  countNeedsYou,
  type FeedItem,
} from "@/lib/dashboardFeed";
import { sectionsForScope } from "@/lib/adminScope";

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

describe("sortFeed crowding", () => {
  it("does not let one kind of item fill the whole feed", () => {
    // The case that exposed it: a patient with a dozen abandoned checkouts
    // saw twelve "Payment not completed" lines and never saw that they had
    // sessions they had paid for and never booked.
    const noisy = Array.from({ length: 12 }, (_, i) =>
      item(`noise-${i}`, `2026-09-0${(i % 9) + 1}T10:00:00Z`, true)
    ).map((i) => ({ ...i, title: "Payment not completed" }));
    const buried = { ...item("important", "2026-08-01T10:00:00Z", true), title: "4 sessions still to book" };

    const sorted = sortFeed([...noisy, buried]);
    expect(sorted.filter((i) => i.title === "Payment not completed")).toHaveLength(3);
    expect(sorted.some((i) => i.title === "4 sessions still to book")).toBe(true);
  });

  it("keeps the newest of a repeated kind, not an arbitrary three", () => {
    const rows = ["2026-09-03", "2026-09-01", "2026-09-02"].map((d, i) => ({
      ...item(`r${i}`, `${d}T10:00:00Z`),
      title: "Same thing",
    }));
    const sorted = sortFeed([...rows, { ...item("extra", "2026-08-01T10:00:00Z"), title: "Same thing" }]);
    expect(sorted).toHaveLength(3);
    expect(sorted[0].at.startsWith("2026-09-03")).toBe(true);
  });
});

describe("buildAdminFeed and the viewer's scope", () => {
  // The feed is a list of links to work. One pointing at a screen the
  // viewer cannot open is not a lighter version of the work -- findTab
  // falls back to the first allowed section, so the tap looks like it
  // worked and lands somewhere else.
  const queues = {
    pendingApprovals: { count: 2, since: "2026-09-01T09:00:00.000Z" },
    pendingRequests: { count: 1, since: "2026-09-02T09:00:00.000Z" },
    failedSyncs: { count: 3, since: "2026-09-03T09:00:00.000Z" },
  };

  function titles(items: FeedItem[]) {
    return items.map((i) => i.title);
  }

  it("keeps the Meet-sync item for a scope that can open Settings", () => {
    const items = buildAdminFeed({
      activity: [],
      ...queues,
      allowedSections: sectionsForScope("full"),
    });
    expect(titles(items).some((t) => t.includes("without a meeting link"))).toBe(true);
  });

  it("drops it for every scope that cannot -- they can neither reach nor fix it", () => {
    for (const scope of ["operations", "finance", "clinical"] as const) {
      const items = buildAdminFeed({
        activity: [],
        ...queues,
        allowedSections: sectionsForScope(scope),
      });
      expect(
        titles(items).some((t) => t.includes("without a meeting link")),
        scope
      ).toBe(false);
      // ...and the approvals queue, which every scope can open, survives.
      expect(titles(items).some((t) => t.includes("waiting for approval")), scope).toBe(true);
    }
  });

  it("is unrestricted when no scope is given, so existing callers are unchanged", () => {
    const items = buildAdminFeed({ activity: [], ...queues });
    expect(titles(items).some((t) => t.includes("without a meeting link"))).toBe(true);
  });

  it("never emits a feed link into a section the viewer cannot open", () => {
    for (const scope of ["full", "operations", "finance", "clinical"] as const) {
      const allowed = sectionsForScope(scope);
      const items = buildAdminFeed({ activity: [], ...queues, allowedSections: allowed });
      for (const item of items) {
        if (!item.href) continue;
        const section = new URL(item.href, "https://x.test").searchParams.get("section");
        expect(allowed, `${scope} feed item "${item.title}"`).toContain(section);
      }
    }
  });
});


// The bug: these three items stamped themselves `new Date()` at render, and
// the admin dashboard re-renders on every realtime event. So a signup that
// had been waiting three days read as "Just now" after any refresh -- worst
// possible behaviour for the one class of item that gets more urgent the
// longer it is ignored.
describe("a queue's date is the oldest thing in it, not the moment we looked", () => {
  const rows = [
    { created_at: "2026-09-03T10:00:00.000Z" },
    { created_at: "2026-09-01T08:00:00.000Z" },
    { created_at: "2026-09-02T09:00:00.000Z" },
  ];

  it("takes the oldest, whatever order the rows arrive in", () => {
    expect(queueRollup(rows)).toEqual({ count: 3, since: "2026-09-01T08:00:00.000Z" });
    expect(queueRollup([...rows].reverse()).since).toBe("2026-09-01T08:00:00.000Z");
  });

  it("counts every row, including one with no readable date", () => {
    const withGap = [...rows, { created_at: null }];
    expect(queueRollup(withGap).count).toBe(4);
    // A row with no date must not make the queue look newer than it is.
    expect(queueRollup(withGap).since).toBe("2026-09-01T08:00:00.000Z");
  });

  it("is empty for no rows, so no item is ever pushed with an invented date", () => {
    expect(queueRollup([])).toEqual({ count: 0, since: "" });
    expect(queueRollup(null)).toEqual({ count: 0, since: "" });
  });

  it("can date a queue by another column", () => {
    const sessions = [{ slotTime: "2026-09-05T06:00:00.000Z" }, { slotTime: "2026-09-04T06:00:00.000Z" }];
    expect(queueRollup(sessions, (s) => s.slotTime).since).toBe("2026-09-04T06:00:00.000Z");
  });

  it("puts that date on the feed item, and the same input always gives the same date", () => {
    const build = () =>
      buildAdminFeed({
        activity: [],
        pendingApprovals: queueRollup(rows),
      });
    const first = build().find((i) => i.title.includes("waiting for approval"));
    expect(first?.at).toBe("2026-09-01T08:00:00.000Z");

    // Built again a moment later -- which is what a refresh is -- it must
    // not have moved.
    const second = build().find((i) => i.title.includes("waiting for approval"));
    expect(second?.at).toBe(first?.at);
  });

  it("still counts correctly in the sentence", () => {
    const one = buildAdminFeed({
      activity: [],
      pendingApprovals: queueRollup([{ created_at: "2026-09-01T08:00:00.000Z" }]),
    });
    expect(one.some((i) => i.title === "1 signup waiting for approval")).toBe(true);
  });
});
