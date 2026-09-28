// What may be typed into a number box.
//
// `<input type="number">` does not accept only digits. Every browser also
// takes `e` and `E` (scientific notation), `+`, `-` and `.`, and Chromium
// keeps them on screen while reporting `value` as the empty string -- so
// typing a letter into the Order box on the condition form put a stray "e"
// in the field, refused every further keystroke, and then submitted as if
// the box were blank. Nothing in the product ever wants 1e5 sessions.
//
// This is the judgement with the DOM taken out: what the box already holds,
// what is being inserted, and what the field's own attributes allow.
// `NumericInputGuard` applies it to every number box in the app from one
// listener, the same shape as the validation chrome -- a rule about what a
// control accepts should not need 26 call sites to remember it.

export type NumericInsertion = {
  /** The text being inserted -- one character when typed, many when pasted.
   *  Null is a deletion, which is never blocked. */
  data: string | null;
  /** What the box holds now, as the browser's own `value` would report it
   *  for a *valid* number, or the raw text where the caller can see it. */
  current: string;
  /** The part of `current` the insertion replaces, so a selected-all retype
   *  is judged against what will remain rather than what is there. */
  selection?: { start: number; end: number };
  /** `step` allows a fraction -- a price does, a session count does not. */
  allowsDecimal: boolean;
  /** `min` is below zero. A field that cannot go negative has no use for a
   *  minus sign, and a stray one is how a box reads as empty. */
  allowsNegative: boolean;
};

/** True when the browser should be stopped from inserting this text. */
export function shouldBlockNumericInsert(insert: NumericInsertion): boolean {
  const { data } = insert;
  // A deletion, or an insertion of nothing, is always somebody correcting
  // themselves.
  if (data == null || data === "") return false;

  const start = insert.selection?.start ?? insert.current.length;
  const end = insert.selection?.end ?? insert.current.length;
  const before = insert.current.slice(0, start);
  const after = insert.current.slice(end);
  const next = `${before}${data}${after}`;

  // Judged on the result rather than on the keystroke: "-" is fine as the
  // first character of a field that may go negative and meaningless in the
  // middle, and one "." is fine where a second is not. A keystroke rule
  // cannot tell those apart.
  return !isTypableNumber(next, insert);
}

/** Whether a string is a number, or the beginning of one somebody is still
 *  typing. "-", "." and "1." are all on the way to a number and must not be
 *  refused mid-keystroke. */
export function isTypableNumber(
  text: string,
  opts: { allowsDecimal: boolean; allowsNegative: boolean }
): boolean {
  if (text === "") return true;
  const pattern = opts.allowsDecimal
    ? opts.allowsNegative
      ? /^-?\d*\.?\d*$/
      : /^\d*\.?\d*$/
    : opts.allowsNegative
      ? /^-?\d*$/
      : /^\d*$/;
  return pattern.test(text);
}

/** A `step` of "1", "10" or "" means whole numbers; "0.01" or "any" means a
 *  fraction is allowed. `any` is the browser's own word for "no step", and
 *  a field carrying it is one where a decimal was never ruled out. */
export function stepAllowsDecimal(step: string | null | undefined): boolean {
  const value = (step ?? "").trim().toLowerCase();
  if (value === "") return false;
  if (value === "any") return true;
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return false;
  return !Number.isInteger(asNumber);
}

/** A `min` below zero, or no `min` at all. A field with no floor is left
 *  able to take a minus sign: refusing one would be this guard deciding a
 *  rule the form never stated. */
export function minAllowsNegative(min: string | null | undefined): boolean {
  const value = (min ?? "").trim();
  if (value === "") return true;
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return true;
  return asNumber < 0;
}
