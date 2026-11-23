import { describe, expect, it } from "vitest";
import { RECAP_DAYS, sessionRecap } from "@/lib/sessionRecap";

const now = Date.parse("2026-11-23T12:00:00Z");
const summary = { appointmentId: "a1", whatWeDid: "We checked your knee.", beforeNextTime: "Heel slides daily.", createdAt: "2026-11-22T12:00:00Z", updatedAt: null };

describe("the session recap (P6)", () => {
  it("shows the shared summary, the exercises and the next session for a week", () => {
    const r = sessionRecap({ summary, writtenBy: "Dr Rao", exercises: { count: 3, parent: false }, next: { slotTime: "2026-11-26T12:30:00Z" }, nowMs: now });
    expect(r).toEqual({
      appointmentId: "a1",
      writtenBy: "Dr Rao",
      writtenAt: "2026-11-22T12:00:00Z",
      whatWeDid: "We checked your knee.",
      beforeNextTime: "Heel slides daily.",
      exercisesLine: "3 home exercises to do",
      nextSlotTime: "2026-11-26T12:30:00Z",
    });
  });
  it("says one exercise and a child's in their parent's voice", () => {
    expect(sessionRecap({ summary, writtenBy: "x", exercises: { count: 1, parent: true }, next: null, nowMs: now })?.exercisesLine).toBe("1 home exercise for your child");
    expect(sessionRecap({ summary, writtenBy: "x", exercises: { count: 0, parent: false }, next: null, nowMs: now })?.exercisesLine).toBeNull();
  });
  it("goes after a week, and never shows an empty summary or none", () => {
    const old = { ...summary, createdAt: new Date(now - (RECAP_DAYS * 24 + 1) * 3600_000).toISOString() };
    expect(sessionRecap({ summary: old, writtenBy: "x", exercises: null, next: null, nowMs: now })).toBeNull();
    expect(sessionRecap({ summary: { ...old, updatedAt: "2026-11-23T10:00:00Z" }, writtenBy: "x", exercises: null, next: null, nowMs: now })).not.toBeNull();
    expect(sessionRecap({ summary: { ...summary, whatWeDid: " ", beforeNextTime: null }, writtenBy: "x", exercises: null, next: null, nowMs: now })).toBeNull();
    expect(sessionRecap({ summary: null, writtenBy: "x", exercises: null, next: null, nowMs: now })).toBeNull();
  });
});
