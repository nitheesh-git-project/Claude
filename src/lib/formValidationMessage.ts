// What a browser would have said in its own grey bubble, said in this app's
// words instead.
//
// A form field carrying `required`, `type="email"`, `minLength` and the rest
// is validated by the browser, and a failed submit pops the browser's own
// tooltip: a grey box in the operating system's font saying "Please fill out
// this field." It is the one piece of UI in the product nobody designed --
// different on every browser, unstyled, gone the moment the reader scrolls,
// and worded like a form from 2005 next to the clinic's own screens.
//
// The chrome that replaces it (`FormValidationChrome`) suppresses the native
// bubble and renders the sentence this module returns. Keeping the wording
// here rather than in the component is the usual split: it is a judgement
// about language with no DOM in it, so it is unit-tested rather than only
// looked at.
//
// Two rules hold it. It **names the field** wherever the page gave it a
// name, because "This is required" over a form of nine boxes is the reader
// hunting for which one. And it says what would make the value acceptable
// rather than only that it was refused -- a length, a format, a bound --
// since the reader is about to type again and that is the half they need.

export type ValidityFacts = {
  /** A message the app set itself, through `setCustomValidity`. */
  customError?: string;
  valueMissing?: boolean;
  typeMismatch?: boolean;
  patternMismatch?: boolean;
  tooShort?: boolean;
  tooLong?: boolean;
  rangeUnderflow?: boolean;
  rangeOverflow?: boolean;
  stepMismatch?: boolean;
  badInput?: boolean;
  /** The control's `type`, where it has one (`email`, `number`, `tel`, ...). */
  type?: string;
  /** The control's own tag, so a select and a checkbox can be worded as what
   *  they are: "choose" and "tick" are not "fill in". */
  tag?: "input" | "select" | "textarea";
  /** What the page calls this field, from its label. Absent is normal -- a
   *  control with no label at all still has to say something. */
  label?: string;
  minLength?: number;
  maxLength?: number;
  min?: string;
  max?: string;
  step?: string;
  /** A `title` on the control, which is the page's own explanation of a
   *  pattern. Used verbatim, because nothing here can improve on it. */
  title?: string;
};

/** The subject of the sentence. "This field" only where the page named
 *  nothing -- a fallback, never the normal case. */
function subject(facts: ValidityFacts): string {
  const label = facts.label?.trim();
  return label ? label : "This field";
}

function isChoice(facts: ValidityFacts): boolean {
  return (
    facts.tag === "select" ||
    facts.type === "radio" ||
    facts.type === "checkbox" ||
    facts.type === "file" ||
    facts.type === "date" ||
    facts.type === "time"
  );
}

/** The whole judgement: one sentence for one refused value. */
export function describeValidity(facts: ValidityFacts): string {
  // The app's own message wins outright. A route or a form that called
  // setCustomValidity knows something this module cannot.
  const custom = facts.customError?.trim();
  if (custom) return custom;

  const name = subject(facts);

  if (facts.valueMissing) {
    if (facts.type === "checkbox") return `${name} needs ticking.`;
    if (facts.type === "radio" || facts.tag === "select") return `Choose ${lowerFirst(name)}.`;
    if (facts.type === "file") return `Choose a file for ${lowerFirst(name)}.`;
    if (facts.type === "date") return `Pick a date for ${lowerFirst(name)}.`;
    if (facts.type === "time") return `Pick a time for ${lowerFirst(name)}.`;
    return `${name} needs filling in.`;
  }

  if (facts.badInput) {
    if (facts.type === "number") return `${name} has to be a number.`;
    return `${name} could not be read. Please type it again.`;
  }

  if (facts.typeMismatch) {
    if (facts.type === "email") return `${name} has to be an email address, like name@example.com.`;
    if (facts.type === "url") return `${name} has to be a web address, starting with https://.`;
    return `${name} is not in the form this field takes.`;
  }

  if (facts.patternMismatch) {
    // A `title` is the page's own explanation of its pattern, written by
    // somebody who knew what the pattern was for. Nothing generated here
    // can beat it.
    const title = facts.title?.trim();
    if (title) return title;
    return `${name} is not in the form this field takes.`;
  }

  if (facts.tooShort && facts.minLength != null) {
    return `${name} has to be at least ${facts.minLength} ${plural("character", facts.minLength)} long.`;
  }

  if (facts.tooLong && facts.maxLength != null) {
    return `${name} has to be ${facts.maxLength} ${plural("character", facts.maxLength)} or fewer.`;
  }

  if (facts.rangeUnderflow && facts.min != null) {
    return `${name} has to be ${facts.min} or more.`;
  }

  if (facts.rangeOverflow && facts.max != null) {
    return `${name} has to be ${facts.max} or less.`;
  }

  if (facts.stepMismatch) {
    // step="1" on a number box is the commonest one by far, and "not one of
    // the values this field accepts" is a riddle where "a whole number" is
    // the answer.
    if (!facts.step || facts.step === "1") return `${name} has to be a whole number.`;
    return `${name} has to be in steps of ${facts.step}.`;
  }

  // Something the browser refused for a reason not listed above. Saying so
  // plainly beats claiming a cause: the reader can see the field, and a
  // wrong explanation sends them to change the wrong thing.
  return isChoice(facts)
    ? `${name} needs a different choice.`
    : `${name} needs checking.`;
}

function plural(word: string, n: number): string {
  return n === 1 ? word : `${word}s`;
}

/** "Full name" -> "full name", for a sentence that starts with a verb.
 *  A name carrying a capital of its own (GST, WhatsApp, Meet) is left
 *  alone: lower-casing it reads as a typo, where lower-casing an ordinary
 *  word does not. Judged on the first word, since that is the only one this
 *  touches. */
function lowerFirst(text: string): string {
  if (!text) return text;
  const firstWord = text.split(/\s/)[0];
  if (/[A-Z]/.test(firstWord.slice(1))) return text;
  return text[0].toLowerCase() + text.slice(1);
}

/** Tidy a label's own text into the name of a field: labels carry required
 *  markers, colons and help text that read as part of the sentence. */
export function tidyFieldLabel(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .replace(/\s+/g, " ")
    .trim()
    // A trailing "*" or "(required)" is the page saying what the message is
    // about to say again.
    .replace(/\s*\(\s*required\s*\)\s*$/i, "")
    .replace(/[*:]\s*$/, "")
    .trim();
  if (!cleaned) return undefined;
  // A label long enough to be help text is not a name, and a sentence built
  // on it reads as two sentences run together.
  if (cleaned.length > 60) return undefined;
  return cleaned;
}
