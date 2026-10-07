import { describe, expect, it } from "vitest";
import { sessionBucket } from "./sessionBucket";

const NOW = Date.parse("2026-10-06T10:00:00Z");
const at = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

describe("sessionBucket", () => {
  it("puts a future session under Upcoming", () => {
    expect(sessionBucket({ status: "confirmed", slotTime: at(2) }, NOW)).toBe("upcoming");
  });
  it("keeps a started, unfinished session under Upcoming", () => {
    expect(sessionBucket({ status: "confirmed", slotTime: at(-1) }, NOW)).toBe("upcoming");
    expect(sessionBucket({ status: "requested", slotTime: at(-23) }, NOW)).toBe("upcoming");
  });
  it("moves it to Past once finished, or a day after it started", () => {
    expect(sessionBucket({ status: "completed", slotTime: at(-1) }, NOW)).toBe("past");
    expect(sessionBucket({ status: "confirmed", slotTime: at(-25) }, NOW)).toBe("past");
  });
  it("keeps cancelled sessions in their own tab", () => {
    expect(sessionBucket({ status: "cancelled", slotTime: at(5) }, NOW)).toBe("cancelled");
  });
  it("treats a session with no time as past", () => {
    expect(sessionBucket({ status: "confirmed", slotTime: null }, NOW)).toBe("past");
  });
});
