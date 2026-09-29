import { describe, it, expect } from "vitest";
import { isCoveredByRefresh, REALTIME_HOP_GRACE_MS } from "./refreshCoverage";

const T = 1_000_000;

describe("isCoveredByRefresh", () => {
  it("covers the browser's own work -- the case the old comparison could never catch", () => {
    // A control's route commits, the response returns, the control refreshes
    // at T, and only then does the event arrive. The old test asked whether
    // the refresh started after the event and so always answered no, which is
    // why every admin action added one to the badge.
    expect(
      isCoveredByRefresh({
        eventArrivedAtMs: T + 300,
        refreshStartedAtMs: T,
        refreshSettledAtMs: 0,
      })
    ).toBe(true);
  });

  it("covers an event that lands while a slow refresh is still in flight", () => {
    // The admin dashboard's own render was measured at 3.5s. Without this the
    // whole of that window counts the page's own news.
    expect(
      isCoveredByRefresh({
        eventArrivedAtMs: T + 3_000,
        refreshStartedAtMs: T,
        refreshSettledAtMs: 0,
      })
    ).toBe(true);
  });

  it("covers an event arriving just after the refresh settled", () => {
    expect(
      isCoveredByRefresh({
        eventArrivedAtMs: T + 3_400,
        refreshStartedAtMs: T,
        refreshSettledAtMs: T + 3_000,
      })
    ).toBe(true);
  });

  it("does not cover a change that lands well after the refresh settled", () => {
    // Somebody else's booking, a minute later. This is what the badge is for,
    // and widening the window until it swallowed this would make the control
    // useless rather than merely noisy.
    expect(
      isCoveredByRefresh({
        eventArrivedAtMs: T + 60_000,
        refreshStartedAtMs: T,
        refreshSettledAtMs: T + 3_000,
      })
    ).toBe(false);
  });

  it("covers nothing at all before the first refresh", () => {
    // A freshly loaded page has re-read nothing, so every change is news.
    // Answering true here would hide the first change of every session.
    expect(
      isCoveredByRefresh({
        eventArrivedAtMs: T,
        refreshStartedAtMs: 0,
        refreshSettledAtMs: 0,
      })
    ).toBe(false);
  });

  it("treats the grace boundary as exclusive, so the edge counts rather than hides", () => {
    const settled = T + 1_000;
    const edge = settled + REALTIME_HOP_GRACE_MS;
    expect(
      isCoveredByRefresh({
        eventArrivedAtMs: edge - 1,
        refreshStartedAtMs: T,
        refreshSettledAtMs: settled,
      })
    ).toBe(true);
    // Exactly at the boundary it is not covered. Where the two directions are
    // "a badge counts one too many" and "a change is never mentioned", the
    // boundary belongs on the side that still tells somebody.
    expect(
      isCoveredByRefresh({
        eventArrivedAtMs: edge,
        refreshStartedAtMs: T,
        refreshSettledAtMs: settled,
      })
    ).toBe(false);
  });

  it("ignores a stale settle from an earlier refresh", () => {
    // Two refreshes in a row: the second has started and not settled, so the
    // window has to run from the second's start, not the first's settle.
    expect(
      isCoveredByRefresh({
        eventArrivedAtMs: T + 10_300,
        refreshStartedAtMs: T + 10_000,
        refreshSettledAtMs: T + 3_000,
      })
    ).toBe(true);
  });

  it("takes a caller's own grace, so the rule is testable rather than tuned in place", () => {
    expect(
      isCoveredByRefresh({
        eventArrivedAtMs: T + 500,
        refreshStartedAtMs: T,
        refreshSettledAtMs: T,
        graceMs: 100,
      })
    ).toBe(false);
  });
});

describe("the in-flight guard", () => {
  it("stops a settle that never arrives from wedging the badge off for ever", () => {
    // A transition that died leaves `refreshSettledAtMs` behind for good. The
    // failure that guards against is worse than the one this module fixes:
    // without it the admin is told nothing ever changes again.
    expect(
      isCoveredByRefresh({
        eventArrivedAtMs: T + 25_000,
        refreshStartedAtMs: T,
        refreshSettledAtMs: 0,
      })
    ).toBe(false);
  });

  it("still covers a render as slow as this dashboard's own", () => {
    // Measured at 3.5s, and 7.9s before the query batching. The cap has to sit
    // well clear of both or it would reintroduce the bug on a slow server.
    expect(
      isCoveredByRefresh({
        eventArrivedAtMs: T + 8_000,
        refreshStartedAtMs: T,
        refreshSettledAtMs: 0,
      })
    ).toBe(true);
  });
});
