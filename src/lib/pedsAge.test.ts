import { describe, expect, it } from "vitest";
import {
  formatAgeMonths,
  parseWeeksAtBirth,
  pedsAgeLine,
  pedsAgeView,
  pedsTodayIso,
  PEDS_CORRECT_UNTIL_MONTHS,
  PEDS_PRETERM_BELOW_WEEKS,
} from "@/lib/pedsAge";

describe("parseWeeksAtBirth", () => {
  it("reads the intake's answer, a bare number or a number", () => {
    expect(parseWeeksAtBirth("32 weeks")).toBe(32);
    expect(parseWeeksAtBirth("32")).toBe(32);
    expect(parseWeeksAtBirth(" 22 weeks ")).toBe(22);
    expect(parseWeeksAtBirth(44)).toBe(44);
  });

  it("is null for not sure, blank or anything outside 22-44", () => {
    for (const raw of ["Not sure", "", null, undefined, "21 weeks", "45 weeks", 21, 45, 30.5, "about 30", "3 weeks"]) {
      expect(parseWeeksAtBirth(raw), String(raw)).toBeNull();
    }
  });
});

describe("pedsAgeView", () => {
  it("corrects a premature child under two: born at 30 weeks, 16.6 months old, 14.3 corrected", () => {
    const view = pedsAgeView({ birthDate: "2025-06-01", weeksAtBirth: 30, onDate: "2026-10-20" });
    expect(view).toEqual({
      status: "ok",
      onDate: "2026-10-20",
      chronologicalMonths: 16.6,
      correctedMonths: 14.3,
      correctionApplied: true,
      weeksAtBirth: 30,
      windowAgeMonths: 14.3,
      basis: "corrected",
      note: null,
    });
  });

  it("matches the handbook's example: born at 32 weeks and now 22 months is about 20 corrected", () => {
    const view = pedsAgeView({ birthDate: "2024-12-20", weeksAtBirth: 32, onDate: "2026-10-20" });
    expect(view.status === "ok" && view.chronologicalMonths).toBe(22);
    expect(view.status === "ok" && view.correctedMonths).toBe(20.1);
  });

  it("does not correct a child born at 37 weeks or later", () => {
    expect(PEDS_PRETERM_BELOW_WEEKS).toBe(37);
    const at37 = pedsAgeView({ birthDate: "2025-06-01", weeksAtBirth: 37, onDate: "2026-10-20" });
    expect(at37).toMatchObject({ status: "ok", correctionApplied: false, correctedMonths: null, windowAgeMonths: 16.6, basis: "chronological", note: "born_at_term" });
    const at36 = pedsAgeView({ birthDate: "2025-06-01", weeksAtBirth: 36, onDate: "2026-10-20" });
    expect(at36).toMatchObject({ status: "ok", correctionApplied: true, basis: "corrected" });
  });

  it("stops correcting at 24 months chronological", () => {
    expect(PEDS_CORRECT_UNTIL_MONTHS).toBe(24);
    const view = pedsAgeView({ birthDate: "2024-10-01", weeksAtBirth: 30, onDate: "2026-10-20" });
    expect(view).toMatchObject({ status: "ok", chronologicalMonths: 24.6, correctionApplied: false, correctedMonths: null, windowAgeMonths: 24.6, note: "past_correction_age" });
  });

  it("says so when weeks at birth is not recorded, and uses chronological age", () => {
    const view = pedsAgeView({ birthDate: "2025-06-01", weeksAtBirth: null, onDate: "2026-10-20" });
    expect(view).toMatchObject({ status: "ok", correctionApplied: false, windowAgeMonths: 16.6, basis: "chronological", note: "weeks_not_recorded" });
    // Past two the correction would not apply anyway, so there is nothing to say.
    expect(pedsAgeView({ birthDate: "2020-01-01", weeksAtBirth: undefined, onDate: "2026-10-20" })).toMatchObject({ note: null });
  });

  it("goes negative before the due date rather than pretending the child is newborn", () => {
    const view = pedsAgeView({ birthDate: "2025-06-01", weeksAtBirth: 30, onDate: "2025-08-01" });
    expect(view).toMatchObject({ status: "ok", chronologicalMonths: 2, correctedMonths: -0.3, windowAgeMonths: -0.3 });
  });

  it("never guesses an age: no date of birth, a future one, or an adult's", () => {
    expect(pedsAgeView({ birthDate: null, weeksAtBirth: 30, onDate: "2026-10-20" })).toEqual({ status: "no_birth_date" });
    expect(pedsAgeView({ birthDate: "not a date", weeksAtBirth: 30, onDate: "2026-10-20" })).toEqual({ status: "no_birth_date" });
    expect(pedsAgeView({ birthDate: "2026-11-01", weeksAtBirth: 30, onDate: "2026-10-20" })).toEqual({ status: "implausible", reason: "future" });
    // Most likely the parent's own date of birth on an account they opened.
    expect(pedsAgeView({ birthDate: "1992-03-14", weeksAtBirth: null, onDate: "2026-10-20" })).toEqual({ status: "implausible", reason: "adult" });
    expect(pedsAgeView({ birthDate: "2009-01-01", weeksAtBirth: null, onDate: "2026-10-20" })).toMatchObject({ status: "ok" });
  });
});

describe("pedsTodayIso", () => {
  it("is the clinic's calendar day, not the server's UTC one", () => {
    // 20:00 UTC on the 19th is 01:30 on the 20th in India.
    expect(pedsTodayIso(Date.parse("2026-10-19T20:00:00Z"))).toBe("2026-10-20");
    expect(pedsTodayIso(Date.parse("2026-10-19T18:00:00Z"))).toBe("2026-10-19");
  });
});

describe("formatAgeMonths and pedsAgeLine", () => {
  it("words an age the way the profile shows it", () => {
    expect(formatAgeMonths(14.3)).toBe("14.3 months");
    expect(formatAgeMonths(9)).toBe("9 months");
    expect(formatAgeMonths(1)).toBe("1 month");
    expect(formatAgeMonths(0.5)).toBe("2 weeks");
    expect(formatAgeMonths(-0.3)).toBe("1 week before the due date");
    expect(formatAgeMonths(24.6)).toBe("2 years");
    expect(formatAgeMonths(27)).toBe("2 years 3 months");
    expect(formatAgeMonths(37)).toBe("3 years 1 month");
  });

  it("shows both ages while the correction applies, and says why not when weeks are missing", () => {
    expect(pedsAgeLine(pedsAgeView({ birthDate: "2025-06-01", weeksAtBirth: 30, onDate: "2026-10-20" }))).toBe(
      "16.6 months (14.3 months corrected, born at 30 weeks)"
    );
    expect(pedsAgeLine(pedsAgeView({ birthDate: "2025-06-01", weeksAtBirth: null, onDate: "2026-10-20" }))).toBe(
      "16.6 months (weeks at birth not recorded, so not corrected)"
    );
    expect(pedsAgeLine(pedsAgeView({ birthDate: "2025-06-01", weeksAtBirth: 39, onDate: "2026-10-20" }))).toBe("16.6 months");
    expect(pedsAgeLine({ status: "no_birth_date" })).toBeNull();
  });
});
