// Validation for the three things an owner types into Business Health.
//
// Kept here rather than inside the six routes for the reason the rest of the
// business maths is: six copies of "is this a real date" is six chances for
// one of them to be laxer than the others, and these routes write the figures
// the clinic quotes at a bank.
//
// Every function returns either a value or a sentence. The sentence is what
// the admin reads, so it says what to do rather than what was wrong with the
// payload -- "Pick the date you bought it", never "invalid invested_on".

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function fail(error: string): Parsed<never> {
  return { ok: false, error };
}

/** A plain `date` column: the shape, and that it is a real day. Checked in IST
 *  because that is the zone every date on these screens is read in. */
export function parseDateInput(value: unknown, field: string): Parsed<string> {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fail(`Pick ${field}.`);
  }
  if (Number.isNaN(new Date(`${value}T00:00:00+05:30`).getTime())) {
    return fail(`${value} is not a real date.`);
  }
  return { ok: true, value };
}

/**
 * A rupee cap, not a paise one.
 *
 * ₹100 crore in a single row is far more likely to be a misplaced decimal
 * than a real figure, and a typo here moves a headline the whole business
 * reads. The same guard `expenses/create` already applies, one order of
 * magnitude wider because an investment and a bank balance legitimately are.
 */
export const MAX_FINANCE_PAISE = 10_000_000_000_00;

export function parsePaise(
  value: unknown,
  field: string,
  { allowZero = false }: { allowZero?: boolean } = {}
): Parsed<number> {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return fail(`Enter ${field} as an amount.`);
  }
  if (value < 0 || (!allowZero && value === 0)) {
    return fail(allowZero ? `${field} cannot be negative.` : `Enter ${field} as more than zero.`);
  }
  if (value > MAX_FINANCE_PAISE) {
    return fail(`That is over ₹100 crore - check the amount for a misplaced decimal point.`);
  }
  return { ok: true, value };
}

/** The same, for a field that may legitimately be left empty. Null survives as
 *  null rather than becoming 0: on every one of these columns, empty means
 *  "not known" and zero means "nothing", and the two are read differently. */
export function parseOptionalPaise(value: unknown, field: string): Parsed<number | null> {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  return parsePaise(value, field, { allowZero: true });
}

export function parseLabel(value: unknown, field: string, max = 120): Parsed<string> {
  if (typeof value !== "string") return fail(`Give ${field}.`);
  const trimmed = value.trim();
  if (trimmed.length === 0) return fail(`Give ${field}.`);
  return { ok: true, value: trimmed.slice(0, max) };
}

export function parseOptionalText(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, max);
}

export function parseOptionalId(value: unknown): Parsed<string | null> {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  if (typeof value !== "string" || !/^[0-9a-fA-F-]{36}$/.test(value)) {
    return fail("That is not a row this app can find.");
  }
  return { ok: true, value };
}

export function parseId(value: unknown): Parsed<string> {
  if (typeof value !== "string" || !/^[0-9a-fA-F-]{36}$/.test(value)) {
    return fail("That is not a row this app can find.");
  }
  return { ok: true, value };
}

/** How long a thing is expected to last, in months. Null is legitimate and
 *  means "do not write this off at all" -- see writeOffInRange, which refuses
 *  to invent a life. 600 months is fifty years, which is a building. */
export function parseUsefulLifeMonths(value: unknown): Parsed<number | null> {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 600) {
    return fail("Give a life between 1 and 600 months, or leave it empty to write nothing off.");
  }
  return { ok: true, value };
}
