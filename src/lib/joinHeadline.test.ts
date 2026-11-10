import { describe, expect, it } from "vitest";
import { isBookedSession, pickJoinSession } from "./joinHeadline";

const NOW = Date.parse("2026-10-28T12:00:00.000Z");
const at = (minutesFromNow: number) => new Date(NOW + minutesFromNow * 60_000).toISOString();
const confirmed = (m: number, extra = {}) => ({ status: "confirmed", slot_time: at(m), duration_minutes: 60, ...extra });

describe("pickJoinSession", () => {
  it("features the soonest session that has not closed", () => {
    const a = confirmed(300);
    const b = confirmed(60);
    expect(pickJoinSession([a, b], NOW, 15)).toBe(b);
  });

  it("keeps a session that has started, until its window closes", () => {
    const started = confirmed(-30);
    expect(pickJoinSession([started, confirmed(500)], NOW, 15)).toBe(started);
    // 60 minute session + 15 minute grace: closed 76 minutes after the start.
    const over = confirmed(-76);
    const later = confirmed(500);
    expect(pickJoinSession([over, later], NOW, 15)).toBe(later);
  });

  it("is null when nothing is on the books", () => {
    expect(pickJoinSession([], NOW, 15)).toBeNull();
    expect(pickJoinSession([confirmed(-500)], NOW, 15)).toBeNull();
  });

  it("ignores cancelled, completed and unreadable rows", () => {
    expect(pickJoinSession([{ status: "cancelled", slot_time: at(60) }], NOW, 15)).toBeNull();
    expect(pickJoinSession([{ status: "completed", slot_time: at(-30) }], NOW, 15)).toBeNull();
    expect(pickJoinSession([{ status: "confirmed", slot_time: "nonsense" }], NOW, 15)).toBeNull();
    expect(pickJoinSession([{ status: "confirmed", slot_time: null }], NOW, 15)).toBeNull();
  });

  it("assumes an hour when the length is missing", () => {
    const noLength = { status: "confirmed", slot_time: at(-70), duration_minutes: null };
    expect(pickJoinSession([noLength], NOW, 15)).toBe(noLength);
  });
});

describe("isBookedSession", () => {
  it("counts a requested session only once it is paid for or on terms", () => {
    expect(isBookedSession({ status: "requested", slot_time: null, payment_status: "unpaid" })).toBe(false);
    expect(isBookedSession({ status: "requested", slot_time: null, payment_status: "paid" })).toBe(true);
    expect(isBookedSession({ status: "requested", slot_time: null, payment_status: "unpaid", payment_terms: "pay_later" })).toBe(true);
    expect(isBookedSession({ status: "confirmed", slot_time: null })).toBe(true);
  });
});
