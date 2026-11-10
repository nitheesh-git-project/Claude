// A child's age, as the paediatric profile shows it: chronological, and
// corrected for prematurity while that still applies.
//
// The handbook's rule: corrected age = age since birth - (40 - weeks of
// pregnancy at birth), used until about 2 years. A baby born eight weeks
// early is not eight weeks behind; judged on birth age, a premature child
// looks delayed when they are not. The arithmetic is
// clinicalCalculators.ts `correctedAgeMonths`; this module decides WHEN it
// applies and shapes both ages for the profile:
//
//   - only for a child born before 37 weeks (premature by the usual
//     definition) -- a child born at 38 weeks is not "corrected" by two
//     weeks;
//   - only while the child is under 24 months chronological;
//   - never guessed: no date of birth is "age not on file", and no weeks at
//     birth is chronological age with that said out loud.
//
// The date of birth is `profiles.date_of_birth`, the patient record's own
// (the patient IS the child; the caregiver answers for them) -- reused, not
// asked again in the intake. Weeks at birth is the intake's optional
// `peds_weeks_at_birth`. A date of birth that makes the patient an adult is
// shown as implausible (most likely the parent's own, on an account they
// opened), never charted against infant windows.
//
// "Today" is the clinic's calendar day (clinicWeek.ts `clinicDateKey`), not
// the server's UTC one: at 02:00 in India a UTC date is still yesterday.
//
// Every threshold here is TO BE VERIFIED BY A SENIOR PHYSIOTHERAPIST against
// its source.

import { CORRECT_AGE_UNTIL_MONTHS, correctedAgeMonths, daysBetween, DAYS_PER_MONTH, roundTo } from "@/lib/clinicalCalculators";
import { clinicDateKey } from "@/lib/clinicWeek";
import { parseIsoDate } from "@/lib/pedsExam";

/** Born before this many weeks is premature; corrected age applies.
 *  To be verified by a senior physiotherapist. */
export const PEDS_PRETERM_BELOW_WEEKS = 37;
/** Corrected age is used until this chronological age. To be verified by a
 *  senior physiotherapist (some clinicians use 36 for very premature
 *  children). */
export const PEDS_CORRECT_UNTIL_MONTHS = CORRECT_AGE_UNTIL_MONTHS;
/** The intake's range for weeks of pregnancy at birth. */
export const PEDS_WEEKS_AT_BIRTH_MIN = 22;
export const PEDS_WEEKS_AT_BIRTH_MAX = 44;
/** At or past this age a date of birth on a paediatric record is treated
 *  as implausible (most likely an adult's own). */
export const PEDS_IMPLAUSIBLE_AGE_YEARS = 19;

/** The intake key holding weeks of pregnancy at birth. */
export const PEDS_WEEKS_AT_BIRTH_KEY = "peds_weeks_at_birth";

/** The clinic's calendar day for an instant, `YYYY-MM-DD`. */
export function pedsTodayIso(nowMs: number): string {
  return clinicDateKey(nowMs);
}

/** Weeks at birth from an intake answer ("32 weeks", "32", 32), or null
 *  for "Not sure", blank or anything outside 22-44. */
export function parseWeeksAtBirth(raw: unknown): number | null {
  let n: number;
  if (typeof raw === "number") n = raw;
  else if (typeof raw === "string") {
    const m = /^\s*(\d{2})(\s*weeks?)?\s*$/i.exec(raw);
    if (!m) return null;
    n = Number(m[1]);
  } else return null;
  if (!Number.isInteger(n) || n < PEDS_WEEKS_AT_BIRTH_MIN || n > PEDS_WEEKS_AT_BIRTH_MAX) return null;
  return n;
}

export type PedsAgeBasis = "corrected" | "chronological";

export type PedsAgeView =
  | { status: "no_birth_date" }
  | { status: "implausible"; reason: "future" | "adult" }
  | {
      status: "ok";
      onDate: string;
      chronologicalMonths: number;
      /** Null when no correction applies (born at 37 weeks or later, weeks
       *  not recorded, or past 24 months). Negative before the due date. */
      correctedMonths: number | null;
      correctionApplied: boolean;
      weeksAtBirth: number | null;
      /** The age every milestone window is read against. */
      windowAgeMonths: number;
      basis: PedsAgeBasis;
      /** Why no correction, when the reason is worth saying. */
      note: "weeks_not_recorded" | "past_correction_age" | "born_at_term" | null;
    };

/**
 * Chronological and corrected age, in months to one decimal, on `onDate`
 * (`YYYY-MM-DD`, normally `pedsTodayIso(now)`).
 */
export function pedsAgeView(input: { birthDate: string | null | undefined; weeksAtBirth: number | null | undefined; onDate: string }): PedsAgeView {
  const birth = parseIsoDate(input.birthDate);
  if (!birth) return { status: "no_birth_date" };
  const days = daysBetween(birth, input.onDate);
  if (days === null) return { status: "no_birth_date" };
  if (days < 0) return { status: "implausible", reason: "future" };
  const chronological = days / DAYS_PER_MONTH;
  if (chronological >= PEDS_IMPLAUSIBLE_AGE_YEARS * 12) return { status: "implausible", reason: "adult" };

  const weeks = parseWeeksAtBirth(input.weeksAtBirth ?? null);
  const chronologicalMonths = roundTo(chronological, 1);
  const base = { status: "ok" as const, onDate: input.onDate, chronologicalMonths, weeksAtBirth: weeks };

  if (weeks === null) {
    return {
      ...base,
      correctedMonths: null,
      correctionApplied: false,
      windowAgeMonths: chronologicalMonths,
      basis: "chronological",
      note: chronological < PEDS_CORRECT_UNTIL_MONTHS ? "weeks_not_recorded" : null,
    };
  }
  if (weeks >= PEDS_PRETERM_BELOW_WEEKS) {
    return { ...base, correctedMonths: null, correctionApplied: false, windowAgeMonths: chronologicalMonths, basis: "chronological", note: "born_at_term" };
  }
  const result = correctedAgeMonths({ birthDate: birth, onDate: input.onDate, gestationWeeksAtBirth: weeks, correctUntilMonths: PEDS_CORRECT_UNTIL_MONTHS });
  if (!result.ok || !result.value.correctionApplied) {
    return {
      ...base,
      correctedMonths: null,
      correctionApplied: false,
      windowAgeMonths: chronologicalMonths,
      basis: "chronological",
      note: "past_correction_age",
    };
  }
  return {
    ...base,
    correctedMonths: result.value.correctedMonths,
    correctionApplied: true,
    windowAgeMonths: result.value.correctedMonths,
    basis: "corrected",
    note: null,
  };
}

/** "9.5 months", "1 month", "2 years 3 months"; under a month after the due
 *  date reads in weeks; before the due date says so. */
export function formatAgeMonths(months: number): string {
  if (!Number.isFinite(months)) return "-";
  if (months < 0) {
    const weeks = Math.round((-months * DAYS_PER_MONTH) / 7);
    return weeks <= 0 ? "at the due date" : `${weeks} ${weeks === 1 ? "week" : "weeks"} before the due date`;
  }
  if (months < 1) {
    const weeks = Math.floor((months * DAYS_PER_MONTH) / 7);
    return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
  }
  if (months < 24) {
    const shown = roundTo(months, 1);
    const text = Number.isInteger(shown) ? String(shown) : shown.toFixed(1);
    return `${text} ${shown === 1 ? "month" : "months"}`;
  }
  const whole = Math.floor(months + 1e-9);
  const years = Math.floor(whole / 12);
  const rest = whole % 12;
  return rest === 0 ? `${years} years` : `${years} years ${rest} ${rest === 1 ? "month" : "months"}`;
}

/** The age line for the profile header and the PDF: "14 months (11.7
 *  months corrected, born at 30 weeks)". Null when there is no age. */
export function pedsAgeLine(view: PedsAgeView): string | null {
  if (view.status !== "ok") return null;
  const chrono = formatAgeMonths(view.chronologicalMonths);
  if (view.correctionApplied && view.correctedMonths !== null) {
    return `${chrono} (${formatAgeMonths(view.correctedMonths)} corrected, born at ${view.weeksAtBirth} weeks)`;
  }
  if (view.note === "weeks_not_recorded") return `${chrono} (weeks at birth not recorded, so not corrected)`;
  return chrono;
}
