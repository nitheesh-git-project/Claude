import { describe, it, expect } from "vitest";
import {
  CLEAR_CONFIRM_PHRASE,
  MIN_RETENTION_DAYS,
  RETENTION_CHOICES,
  activityCategoriesPresent,
  activityCategory,
  activityCategoryLabel,
  countOlderThan,
  EMPTY_ACTIVITY_FILTERS,
  filterActivityRows,
  matchesActivityQuery,
  refuseRetention,
  retentionCutoff,
} from "@/lib/activityLog";
import { ADMIN_ACTIVITY_LABELS } from "@/lib/adminActivityLog";

function row(over: Partial<{
  actorName: string;
  action: string;
  targetLabel: string | null;
  createdAt: string;
}> = {}) {
  return {
    actorName: "Asha Rao",
    action: "refund.issue",
    targetLabel: "Priya Menon",
    createdAt: "2026-09-01T10:00:00.000Z",
    ...over,
  };
}

describe("activityCategory", () => {
  it("puts every known action into a named category", () => {
    for (const action of Object.keys(ADMIN_ACTIVITY_LABELS)) {
      expect(activityCategory(action), action).not.toBe("other");
    }
  });

  it("falls back to Other for an action it has never heard of", () => {
    expect(activityCategory("something.new")).toBe("other");
    expect(activityCategoryLabel("other")).toBe("Other");
  });

  it("names a category the way the sidebar names its section", () => {
    expect(activityCategoryLabel(activityCategory("payout.settle"))).toBe("Money");
    expect(activityCategoryLabel(activityCategory("session.assign"))).toBe("Sessions");
    expect(activityCategoryLabel(activityCategory("data.reset"))).toBe("Master Admin only");
  });
});

describe("activityCategoriesPresent", () => {
  // A filter offering a category with nothing behind it answers "nothing
  // matches" and reads as a broken screen.
  it("offers only the categories that have rows, in section order", () => {
    const rows = [
      row({ action: "payout.settle" }),
      row({ action: "session.assign" }),
      row({ action: "data.reset" }),
      row({ action: "payout.settle" }),
    ];
    expect(activityCategoriesPresent(rows)).toEqual(["sessions", "money", "full_only"]);
  });

  it("offers nothing for an empty log", () => {
    expect(activityCategoriesPresent([])).toEqual([]);
  });
});

describe("matchesActivityQuery", () => {
  it("matches the label a person would type, not only the stored key", () => {
    expect(matchesActivityQuery(row(), "refund")).toBe(true);
    expect(matchesActivityQuery(row({ action: "payout.settle" }), "settled")).toBe(true);
  });

  it("matches the subject and the admin by name", () => {
    expect(matchesActivityQuery(row(), "priya")).toBe(true);
    expect(matchesActivityQuery(row(), "asha")).toBe(true);
  });

  it("narrows on every term rather than widening", () => {
    expect(matchesActivityQuery(row(), "asha priya")).toBe(true);
    expect(matchesActivityQuery(row(), "asha ravi")).toBe(false);
  });

  it("matches everything on an empty query", () => {
    expect(matchesActivityQuery(row(), "   ")).toBe(true);
  });

  it("survives a row with no subject", () => {
    expect(matchesActivityQuery(row({ targetLabel: null }), "refund")).toBe(true);
  });
});

describe("filterActivityRows", () => {
  const rows = [
    row({ actorName: "Asha Rao", action: "refund.issue", createdAt: "2026-09-01T10:00:00Z" }),
    row({ actorName: "Vik Shah", action: "session.assign", createdAt: "2026-09-05T10:00:00Z" }),
    row({ actorName: "Asha Rao", action: "setting.update", createdAt: "2026-09-09T10:00:00Z" }),
  ];

  it("returns everything when nothing is set", () => {
    expect(filterActivityRows(rows, EMPTY_ACTIVITY_FILTERS)).toHaveLength(3);
  });

  it("narrows by admin, category, money and date together", () => {
    expect(
      filterActivityRows(rows, { ...EMPTY_ACTIVITY_FILTERS, actorName: "Asha Rao" })
    ).toHaveLength(2);
    expect(
      filterActivityRows(rows, { ...EMPTY_ACTIVITY_FILTERS, category: "money" }).map(
        (r) => r.action
      )
    ).toEqual(["refund.issue"]);
    expect(
      filterActivityRows(rows, { ...EMPTY_ACTIVITY_FILTERS, moneyOnly: true })
    ).toHaveLength(1);
    expect(
      filterActivityRows(rows, {
        ...EMPTY_ACTIVITY_FILTERS,
        fromDate: "2026-09-02",
        toDate: "2026-09-05",
      }).map((r) => r.action)
    ).toEqual(["session.assign"]);
  });

  it("keeps both bounds inclusive", () => {
    expect(
      filterActivityRows(rows, {
        ...EMPTY_ACTIVITY_FILTERS,
        fromDate: "2026-09-01",
        toDate: "2026-09-01",
      })
    ).toHaveLength(1);
  });
});

describe("retention", () => {
  // The floor is the whole reason clearing is safe to offer: an admin must
  // not be able to act and then remove the record of having acted.
  it("refuses any cutoff inside the protected window", () => {
    for (const days of [0, 1, 7, MIN_RETENTION_DAYS - 1]) {
      expect(refuseRetention(days, CLEAR_CONFIRM_PHRASE)).not.toBeNull();
    }
    expect(refuseRetention(MIN_RETENTION_DAYS, CLEAR_CONFIRM_PHRASE)).toBeNull();
  });

  it("offers no choice below the floor", () => {
    for (const days of RETENTION_CHOICES) {
      expect(days).toBeGreaterThanOrEqual(MIN_RETENTION_DAYS);
      expect(refuseRetention(days, CLEAR_CONFIRM_PHRASE)).toBeNull();
    }
  });

  it("refuses a non-integer, a missing value and a wrong phrase", () => {
    expect(refuseRetention("90", CLEAR_CONFIRM_PHRASE)).not.toBeNull();
    expect(refuseRetention(90.5, CLEAR_CONFIRM_PHRASE)).not.toBeNull();
    expect(refuseRetention(undefined, CLEAR_CONFIRM_PHRASE)).not.toBeNull();
    expect(refuseRetention(90, "clear logs")).not.toBeNull();
    expect(refuseRetention(90, "")).not.toBeNull();
    expect(refuseRetention(90, ` ${CLEAR_CONFIRM_PHRASE} `)).toBeNull();
  });

  it("puts the cutoff that many days back", () => {
    const now = Date.parse("2026-09-11T00:00:00.000Z");
    expect(retentionCutoff(30, now).toISOString()).toBe("2026-08-12T00:00:00.000Z");
  });

  // "Clear old entries" with no number beside it asks somebody to approve an
  // amount they were never told.
  it("counts what a cutoff would take", () => {
    const cutoff = new Date("2026-09-05T00:00:00.000Z");
    const rows = [
      { createdAt: "2026-09-01T10:00:00.000Z" },
      { createdAt: "2026-09-04T23:59:59.000Z" },
      { createdAt: "2026-09-05T00:00:00.000Z" },
      { createdAt: "2026-09-09T10:00:00.000Z" },
    ];
    expect(countOlderThan(rows, cutoff)).toBe(2);
  });
});
