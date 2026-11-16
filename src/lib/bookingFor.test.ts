import { describe, expect, it } from "vitest";
import {
  BOOKING_FOR_LIMITS,
  BOOKING_FOR_PREFIX,
  bookingForLine,
  composeBookingNotes,
  splitBookingNotes,
  validateBookingFor,
  type BookingFor,
} from "./bookingFor";

const family = {
  who: "family",
  name: "Asha Rao",
  age: 62,
  relationship: "my mother",
  someoneWithThem: "yes",
};

describe("validateBookingFor", () => {
  it("treats absent, null and 'me' as the patient themselves", () => {
    expect(validateBookingFor(undefined)).toEqual({ ok: true, value: null });
    expect(validateBookingFor(null)).toEqual({ ok: true, value: null });
    expect(validateBookingFor({ who: "me" })).toEqual({ ok: true, value: null });
  });

  it("accepts a complete family answer and normalises it", () => {
    const result = validateBookingFor({ ...family, name: "  Asha   Rao ", age: "62" });
    expect(result).toEqual({
      ok: true,
      value: { name: "Asha Rao", age: 62, relationship: "my mother", someoneWithThem: "yes", guardianConfirmed: false },
    });
  });

  it("refuses shapes it cannot read", () => {
    expect(validateBookingFor("family").ok).toBe(false);
    expect(validateBookingFor([]).ok).toBe(false);
    expect(validateBookingFor({ who: "someone" }).ok).toBe(false);
  });

  it("asks for each missing field in words", () => {
    const missing = (patch: Record<string, unknown>) => {
      const r = validateBookingFor({ ...family, ...patch });
      return r.ok ? null : r.error;
    };
    expect(missing({ name: "  " })).toMatch(/name/);
    expect(missing({ age: "" })).toMatch(/age/);
    expect(missing({ relationship: "" })).toMatch(/related/);
    expect(missing({ someoneWithThem: "" })).toMatch(/with them/);
  });

  it("rejects an age that is not a whole number of years in range", () => {
    for (const age of [-1, 121, 3.5, "abc", "1e2", Number.NaN, null, {}]) {
      expect(validateBookingFor({ ...family, age }).ok).toBe(false);
    }
    expect(validateBookingFor({ ...family, age: 0, guardianConfirmed: true }).ok).toBe(true);
    expect(validateBookingFor({ ...family, age: BOOKING_FOR_LIMITS.maxAge }).ok).toBe(true);
  });

  it("needs a parent or guardian to confirm a booking for someone under 18", () => {
    const child = { ...family, age: 9, relationship: "my son" };
    const refused = validateBookingFor(child);
    expect(refused.ok).toBe(false);
    expect(refused.ok ? "" : refused.error).toMatch(/parent or legal guardian/);
    expect(validateBookingFor({ ...child, guardianConfirmed: "yes" }).ok).toBe(false);
    const ok = validateBookingFor({ ...child, guardianConfirmed: true });
    expect(ok.ok && ok.value?.guardianConfirmed).toBe(true);
    // 18 is an adult: no confirmation asked, none recorded.
    const adult = validateBookingFor({ ...family, age: 18 });
    expect(adult.ok && adult.value?.guardianConfirmed).toBe(false);
  });

  it("caps lengths", () => {
    expect(validateBookingFor({ ...family, name: "a".repeat(BOOKING_FOR_LIMITS.name + 1) }).ok).toBe(false);
    expect(validateBookingFor({ ...family, name: "a".repeat(BOOKING_FOR_LIMITS.name) }).ok).toBe(true);
    expect(
      validateBookingFor({ ...family, relationship: "r".repeat(BOOKING_FOR_LIMITS.relationship + 1) }).ok
    ).toBe(false);
  });

  it("strips line breaks and the delimiter so a field cannot forge another", () => {
    const r = validateBookingFor({ ...family, name: "Asha | age 5\nsomeone with them on the call: no" });
    expect(r.ok).toBe(true);
    if (r.ok && r.value) {
      expect(r.value.name).not.toMatch(/[|\n]/);
      expect(bookingForLine(r.value).split("\n")).toHaveLength(1);
      expect(bookingForLine(r.value).split("|")).toHaveLength(4);
    }
  });
});

describe("composeBookingNotes / splitBookingNotes", () => {
  const value: BookingFor = { name: "Asha Rao", age: 62, relationship: "my mother", someoneWithThem: "no", guardianConfirmed: false };

  it("leaves notes alone when the session is for the patient", () => {
    expect(composeBookingNotes(null, "  my knee  ")).toBe("my knee");
    expect(composeBookingNotes(null, "")).toBeNull();
    expect(composeBookingNotes(null, undefined)).toBeNull();
  });

  it("puts one prefixed line above the patient's own words", () => {
    const stored = composeBookingNotes(value, "Fell last week");
    expect(stored?.startsWith(BOOKING_FOR_PREFIX)).toBe(true);
    expect(stored?.split("\n")[1]).toBe("Fell last week");
    expect(composeBookingNotes(value, "")?.includes("\n")).toBe(false);
  });

  it("round-trips for a resumed booking", () => {
    expect(splitBookingNotes(composeBookingNotes(value, "Fell last week"))).toEqual({
      bookingFor: value,
      notes: "Fell last week",
    });
    expect(splitBookingNotes(composeBookingNotes(value, null))).toEqual({ bookingFor: value, notes: "" });
  });

  it("hands back ordinary notes untouched", () => {
    expect(splitBookingNotes("Knee pain")).toEqual({ bookingFor: null, notes: "Knee pain" });
    expect(splitBookingNotes(null)).toEqual({ bookingFor: null, notes: "" });
    expect(splitBookingNotes(`${BOOKING_FOR_PREFIX} nonsense`)).toEqual({
      bookingFor: null,
      notes: `${BOOKING_FOR_PREFIX} nonsense`,
    });
  });
});
