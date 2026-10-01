import { describe, expect, it } from "vitest";
import { CLINIC_TIMEZONE } from "./bookingSlots";

const DST_ZONE = "Europe/London";

/**
 * The clinic's zone does not observe daylight saving, and that is a **checked
 * assumption rather than a believed one**.
 *
 * Item 108 asked for timezone edge-case coverage. Midnight, the Sunday/Monday
 * boundary, the year boundary and IST-vs-UTC are covered by
 * `clinicWeek.test.ts`; every `toLocale*String` without an explicit zone is
 * caught by `formatDateTime.test.ts`'s walk; the browser suite pins `TZ`. DST
 * was the one genuinely untested case, and the reason given was that **India
 * has none** -- which is true, and is an assumption nothing was holding.
 *
 * This codebase is full of arithmetic that is only safe because every day in
 * `Asia/Kolkata` is 24 hours long: a whole-hour slot rule judged in the
 * booking's own zone, a week that starts on Monday, a "same day" test for a
 * home visit, a lead time measured in hours, an offer window in days. Point
 * `CLINIC_TIMEZONE` at a zone with DST and two of those break twice a year,
 * silently, on the days a patient is most likely to arrive an hour early --
 * and no test anywhere would notice.
 *
 * So rather than writing DST cases for a zone that has none, which would
 * assert nothing, this fails the moment the premise stops holding. Whoever
 * changes that constant gets told what they have to go and fix; today it is
 * a one-line guard over a decision the whole product leans on.
 */

/** The offset this zone puts a given instant at, in minutes. */
function offsetMinutes(zone: string, when: Date): number {
  // `longOffset` gives "GMT+05:30" -- the only formatter output that states
  // the offset rather than implying it through a wall-clock reading.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    timeZoneName: "longOffset",
  }).formatToParts(when);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 0; // "GMT" alone is UTC.
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

describe("the clinic's timezone", () => {
  it("has the same offset all year, so every day is 24 hours long", () => {
    // Sampled on the 15th of each month: a DST transition always falls in
    // some month, and no zone shifts twice inside one month.
    const offsets = new Set<number>();
    for (let month = 0; month < 12; month += 1) {
      offsets.add(offsetMinutes(CLINIC_TIMEZONE, new Date(Date.UTC(2026, month, 15, 12))));
    }
    expect(
      [...offsets],
      `${CLINIC_TIMEZONE} observes daylight saving. The whole-hour slot rule, ` +
        `the Monday-start week, the same-day home-visit test, the booking lead ` +
        `time and every window measured in days all assume a 24-hour day, and ` +
        `two of them break twice a year without failing anything. Fix those ` +
        `before changing this constant.`
    ).toHaveLength(1);
  });

  it("would notice a zone that does observe it", () => {
    // The negative control, kept in the file rather than run once by hand:
    // without it this passes just as well on a broken offset reader, and a
    // guard that cannot fail is the thing it was written to replace.
    const offsets = new Set<number>();
    for (let month = 0; month < 12; month += 1) {
      offsets.add(offsetMinutes(DST_ZONE, new Date(Date.UTC(2026, month, 15, 12))));
    }
    expect([...offsets].length).toBeGreaterThan(1);
  });

  it("is a real IANA zone rather than a string nothing validates", () => {
    // A typo here does not throw -- Intl falls back -- so the product would
    // quietly format every date in UTC.
    expect(() =>
      new Intl.DateTimeFormat("en-GB", { timeZone: CLINIC_TIMEZONE }).format(new Date())
    ).not.toThrow();
    expect(CLINIC_TIMEZONE).toContain("/");
  });
});
