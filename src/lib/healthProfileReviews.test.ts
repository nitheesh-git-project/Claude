import { describe, expect, it } from "vitest";
import { daysWaiting, isOverdue, oldestFirst, waitingLabel } from "./healthProfileReviews";

const NOW = Date.parse("2026-06-10T09:00:00Z");

describe("waiting time", () => {
  it("counts whole days and words them", () => {
    expect(waitingLabel("2026-06-10T01:00:00Z", NOW)).toBe("Waiting since today");
    expect(waitingLabel("2026-06-09T08:00:00Z", NOW)).toBe("Waiting 1 day");
    expect(waitingLabel("2026-06-05T09:00:00Z", NOW)).toBe("Waiting 5 days");
  });

  it("is overdue only past three days", () => {
    expect(isOverdue("2026-06-07T09:00:00Z", NOW)).toBe(false);
    expect(isOverdue("2026-06-06T08:00:00Z", NOW)).toBe(true);
  });

  it("never reports a negative or NaN wait", () => {
    expect(daysWaiting("2026-07-01T00:00:00Z", NOW)).toBe(0);
    expect(daysWaiting("nonsense", NOW)).toBe(0);
  });
});

describe("oldestFirst", () => {
  it("puts the longest wait first and unreadable dates last", () => {
    const rows = [{ at: "2026-06-09T00:00:00Z" }, { at: "bad" }, { at: "2026-06-01T00:00:00Z" }];
    expect(oldestFirst(rows, (r) => r.at).map((r) => r.at)).toEqual([
      "2026-06-01T00:00:00Z",
      "2026-06-09T00:00:00Z",
      "bad",
    ]);
  });
});
