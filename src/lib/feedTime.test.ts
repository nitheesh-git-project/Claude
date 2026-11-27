import { describe, expect, it } from "vitest";
import { feedTimeLabel } from "./feedTime";

const NOW = Date.parse("2026-11-27T06:30:00Z"); // 12:00 IST
const at = (minsAgo: number) => new Date(NOW - minsAgo * 60_000).toISOString();

describe("feedTimeLabel", () => {
  it("counts back from now", () => {
    expect(feedTimeLabel(at(0), NOW)).toBe("just now");
    expect(feedTimeLabel(at(5), NOW)).toBe("5m ago");
    expect(feedTimeLabel(at(180), NOW)).toBe("3h ago");
    expect(feedTimeLabel(at(2 * 1440), NOW)).toBe("2d ago");
  });
  it("never calls a future time just now", () => {
    expect(feedTimeLabel(at(-3 * 1440), NOW)).toBe("30 Nov");
    expect(feedTimeLabel(at(-60), NOW)).toBe("27 Nov");
  });
  it("prints the date after a week, and nothing for no date", () => {
    expect(feedTimeLabel(at(10 * 1440), NOW)).toBe("17 Nov");
    expect(feedTimeLabel("", NOW)).toBe("");
  });
});
