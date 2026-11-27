import { describe, expect, it } from "vitest";
import { payoutNoticeIsFresh } from "./payoutNotice";

const NOW = Date.parse("2026-11-27T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe("payoutNoticeIsFresh", () => {
  it("shows a payout made in the last two weeks", () => {
    expect(payoutNoticeIsFresh(daysAgo(1), NOW)).toBe(true);
    expect(payoutNoticeIsFresh(daysAgo(14), NOW)).toBe(true);
  });
  it("drops an old payout, or one with no completion time", () => {
    expect(payoutNoticeIsFresh(daysAgo(15), NOW)).toBe(false);
    expect(payoutNoticeIsFresh(null, NOW)).toBe(false);
  });
});
