// How many years a therapist has been practising, as a value with one bound.
//
// Three doors now ask for it -- the public application form, User Access's
// create-account form, and the therapist's own gated profile edit -- and a
// fourth writer is the signup trigger in `schema.sql`. A number typed into
// four boxes with four different ideas of what is acceptable is how one of
// them comes to store 2024 (the year they qualified) or -3, on a figure
// patients read beside a clinician's name.
//
// Dependency-free and unit-tested, the same reason `numericInputGuard` and
// `clampFocal` are: this is a judgement about an input, and the cases that
// matter are the ones a browser does not refuse.

/** Nobody has practised for longer than this, and a bigger number is a year
 *  somebody typed into the wrong box. */
export const MAX_YEARS_EXPERIENCE = 60;

/**
 * What to store for something a browser sent.
 *
 * - `null` for an absent or blank answer -- "not said" is a real state and
 *   every surface already renders it as "Years of experience not set".
 * - `undefined` for a value that was given and is not usable, so a caller
 *   can tell "they left it blank" from "they typed 2024" and refuse only
 *   the second. Collapsing those two is how a typo gets saved as a blank.
 */
export function parseYearsExperience(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (text === "") return null;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0 || value > MAX_YEARS_EXPERIENCE) {
    return undefined;
  }
  return value;
}

export const YEARS_EXPERIENCE_ERROR = `Years of experience must be a whole number between 0 and ${MAX_YEARS_EXPERIENCE}.`;
