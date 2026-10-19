import { describe, expect, it } from "vitest";
import { completionOpensAtMs, sessionExamWindowStartMs, SESSION_EXAM_LEAD_MS } from "@/lib/sessionCompletion";

const SLOT = Date.parse("2026-10-01T12:30:00Z");

describe("completionOpensAtMs", () => {
  it("opens Done at the scheduled start, not at the join window", () => {
    expect(completionOpensAtMs(SLOT, "done", 15)).toBe(SLOT);
  });

  it("opens No-show only after the late-arrival grace", () => {
    expect(completionOpensAtMs(SLOT, "no_show", 15)).toBe(SLOT + 15 * 60_000);
  });

  it("never opens No-show before the start, whatever the setting says", () => {
    expect(completionOpensAtMs(SLOT, "no_show", -10)).toBe(SLOT);
  });
});

describe("sessionExamWindowStartMs", () => {
  const HOUR = 60 * 60_000;

  it("opens an hour before the slot on the real clock", () => {
    expect(SESSION_EXAM_LEAD_MS).toBe(HOUR);
    expect(sessionExamWindowStartMs(SLOT, 0)).toBe(SLOT - HOUR);
  });

  it("counts an exam taken on the simulated clock for a session still ahead in real time", () => {
    // Real now is five hours before the slot; the debug clock runs six hours
    // ahead, so it reads an hour after it. The exam's created_at is the real
    // now, which the unshifted window (slot - 1h) refused -- Done stayed
    // blocked on an exam the therapist had just recorded.
    const realNow = SLOT - 5 * HOUR;
    const offset = 6 * HOUR;
    expect(realNow).toBeLessThan(sessionExamWindowStartMs(SLOT, 0));
    expect(realNow).toBeGreaterThanOrEqual(sessionExamWindowStartMs(SLOT, offset));
  });

  it("still refuses an exam from before the session on that same simulated clock", () => {
    // Eight real hours before the slot is two simulated hours before it.
    expect(SLOT - 8 * HOUR).toBeLessThan(sessionExamWindowStartMs(SLOT, 6 * HOUR));
  });
});
