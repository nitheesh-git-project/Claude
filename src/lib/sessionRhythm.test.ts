import { describe, it, expect } from "vitest";
import { daysBetweenSessions, proposeSessionRhythm } from "@/lib/sessionRhythm";

// A Monday, so the weekly-cap assertions below are readable.
const NOW = Date.parse("2026-09-07T09:00:00");
const LEAD = 12 * 3_600_000;

function base(overrides: Partial<Parameters<typeof proposeSessionRhythm>[0]> = {}) {
  return proposeSessionRhythm({
    count: 5,
    frequencyPerWeek: 2,
    minGapHours: null,
    maxPerWeek: null,
    nowMs: NOW,
    leadTimeMs: LEAD,
    expiresAtMs: null,
    ...overrides,
  });
}

describe("daysBetweenSessions", () => {
  it("turns a weekly frequency into a readable rhythm", () => {
    expect(daysBetweenSessions(1)).toBe(7);
    expect(daysBetweenSessions(2)).toBe(3);
    expect(daysBetweenSessions(3)).toBe(2);
    expect(daysBetweenSessions(7)).toBe(1);
  });

  it("falls back to weekly when the clinician left it open", () => {
    // Null is "they did not say", not "as often as possible".
    expect(daysBetweenSessions(null)).toBe(7);
    expect(daysBetweenSessions(0)).toBe(7);
  });
});

describe("proposeSessionRhythm", () => {
  it("proposes exactly what was asked for", () => {
    expect(base().length).toBe(5);
    expect(base({ count: 1 }).length).toBe(1);
    expect(base({ count: 0 })).toEqual([]);
  });

  it("never proposes a slot inside the lead time", () => {
    // The whole run is bookable, or the patient meets a refusal on submit
    // for a schedule the app itself suggested.
    for (const slot of base()) {
      const startMs = new Date(`${slot.dateKey}T${String(slot.hour).padStart(2, "0")}:00`).getTime();
      expect(startMs).toBeGreaterThanOrEqual(NOW + LEAD);
    }
  });

  it("spaces the run by the clinician's frequency", () => {
    const slots = base({ frequencyPerWeek: 2 });
    const days = slots.map((s) => new Date(`${s.dateKey}T00:00:00`).getTime() / 86_400_000);
    for (let i = 1; i < days.length; i++) {
      expect(days[i] - days[i - 1]).toBeGreaterThanOrEqual(3);
    }
  });

  it("respects a programme's minimum gap over a faster frequency", () => {
    // A clinician asking for three a week on a programme that demands 72
    // hours between sessions gets 72 hours. The stricter rule wins, and it
    // is the programme's, because that is the one checkout sold.
    const slots = base({ frequencyPerWeek: 3, minGapHours: 72, count: 4 });
    for (let i = 1; i < slots.length; i++) {
      const a = new Date(`${slots[i - 1].dateKey}T${String(slots[i - 1].hour).padStart(2, "0")}:00`).getTime();
      const b = new Date(`${slots[i].dateKey}T${String(slots[i].hour).padStart(2, "0")}:00`).getTime();
      expect(b - a).toBeGreaterThanOrEqual(72 * 3_600_000);
    }
  });

  it("never puts more in a calendar week than the programme allows", () => {
    const slots = base({ frequencyPerWeek: 7, maxPerWeek: 2, count: 6 });
    const perWeek = new Map<string, number>();
    for (const s of slots) {
      const d = new Date(`${s.dateKey}T00:00:00`);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const key = d.toDateString();
      perWeek.set(key, (perWeek.get(key) ?? 0) + 1);
    }
    for (const n of perWeek.values()) expect(n).toBeLessThanOrEqual(2);
  });

  it("stops at the programme's expiry rather than proposing sessions that would be lost", () => {
    // Returning fewer is the honest answer. Padding the run past the expiry
    // would propose appointments the patient cannot keep.
    const slots = base({ count: 8, frequencyPerWeek: 1, expiresAtMs: NOW + 20 * 86_400_000 });
    expect(slots.length).toBeLessThan(8);
    for (const s of slots) {
      const startMs = new Date(`${s.dateKey}T${String(s.hour).padStart(2, "0")}:00`).getTime();
      expect(startMs).toBeLessThanOrEqual(NOW + 20 * 86_400_000);
    }
  });

  it("holds one time of day across the run", () => {
    // A course at the same hour every time is one thing to remember rather
    // than five.
    const hours = new Set(base().map((s) => s.hour));
    expect(hours.size).toBe(1);
  });

  it("opens on the preferred hour when that hour is bookable", () => {
    expect(base({ preferredHour: 17 })[0].hour).toBe(17);
  });

  it("proposes no duplicate slots", () => {
    const slots = base({ count: 6, frequencyPerWeek: 7, minGapHours: 1 });
    const keys = slots.map((s) => `${s.dateKey}T${s.hour}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("proposeSessionRhythm, awkward inputs", () => {
  it("skips the day rather than the hour when a preferred time is set", () => {
    // 9am now plus a 12-hour lead time means today can only offer the
    // evening. Someone who asked for five o'clock gets five o'clock
    // tomorrow, not nine in the evening today.
    const slots = proposeSessionRhythm({
      count: 2,
      frequencyPerWeek: 1,
      minGapHours: null,
      maxPerWeek: null,
      nowMs: NOW,
      leadTimeMs: LEAD,
      expiresAtMs: null,
      preferredHour: 17,
    });
    expect(slots[0].hour).toBe(17);
    expect(slots[0].dateKey).toBe("2026-09-08");
  });

  it("ignores a preferred hour the clinic does not open for", () => {
    // Otherwise the run scans a year looking for three in the morning and
    // comes back with nothing.
    const slots = base({ preferredHour: 3, count: 2 });
    expect(slots.length).toBe(2);
  });

  it("returns nothing rather than something impossible", () => {
    expect(base({ count: 3, expiresAtMs: NOW }).length).toBe(0);
    expect(base({ count: -1 })).toEqual([]);
  });

  it("survives a weekly cap of zero without spinning", () => {
    // maxPerWeek 0 is not a real configuration, but a null-ish column read
    // as 0 must not become an infinite scan.
    expect(base({ maxPerWeek: 0, count: 3 }).length).toBe(3);
  });
});
