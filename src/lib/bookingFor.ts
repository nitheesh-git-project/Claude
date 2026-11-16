// "Who is this for?" on the booking wizard.
//
// A patient booking for a parent or a child is common, and the clinic needs
// to know before the call: whose body it is, how old they are, and whether an
// adult will be beside them. There is no column for it (and this change does
// not touch schema.sql), so it travels in the booking's existing `notes`
// field as ONE clearly prefixed line ahead of whatever the patient wrote.
//
// Dependency-free so the wording, the validation and the round trip are
// testable without a browser or a database.
//
// Safety posture, because this crosses the client/server line:
//   - The browser sends a small structured object, never the finished line.
//     The server (`/api/appointments/create`) validates it with
//     `validateBookingFor` and builds the line itself, so a hand-made request
//     cannot smuggle in a longer or differently shaped one.
//   - Every field is trimmed, stripped of control characters and of the
//     delimiter, and length-capped.
//   - No identifier travels in it. It names nobody's account: the booking is
//     the signed-in patient's, as before.

/** The line's marker. Parsing looks for exactly this at the very start. */
export const BOOKING_FOR_PREFIX = "Booked for a family member:";

export const BOOKING_FOR_LIMITS = {
  name: 80,
  relationship: 40,
  minAge: 0,
  maxAge: 120,
} as const;

/** The most a booking's notes may hold once the line is added. */
export const BOOKING_NOTES_MAX = 2000;

export type SomeoneWithThem = "yes" | "no";

export type BookingFor = {
  name: string;
  /** Whole years. */
  age: number;
  relationship: string;
  /** Will another adult be with them during the video call? */
  someoneWithThem: SomeoneWithThem;
  /** For someone under 18: the booker confirmed they are the parent or legal
   *  guardian. Always false for an adult. Recorded in policy_acceptances,
   *  not in the notes line. */
  guardianConfirmed: boolean;
};

/** The age below which a parent or guardian must confirm the booking. */
export const GUARDIAN_AGE = 18;

export type BookingForResult =
  | { ok: true; value: BookingFor | null }
  | { ok: false; error: string };

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/** One line of plain words: no control characters, no delimiter, no runs of
 *  spaces. */
export function cleanBookingForText(value: string): string {
  return value.replace(CONTROL_CHARS, " ").replace(/[|]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * What the server does with the `bookingFor` field of a booking request.
 * `undefined`, `null` and `{ who: "me" }` all mean "the patient themselves"
 * and yield `value: null`. Anything else must be a complete, well-formed
 * family-member answer or the request is refused with words the patient can
 * act on (the wizard checks the same things first, so this is the belt).
 */
export function validateBookingFor(raw: unknown): BookingForResult {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "We couldn't read who this session is for." };
  }
  const input = raw as Record<string, unknown>;
  if (input.who === "me") return { ok: true, value: null };
  if (input.who !== "family") {
    return { ok: false, error: "We couldn't read who this session is for." };
  }

  const name = typeof input.name === "string" ? cleanBookingForText(input.name) : "";
  if (!name) return { ok: false, error: "Please tell us the name of the person this session is for." };
  if (name.length > BOOKING_FOR_LIMITS.name) {
    return { ok: false, error: `Their name can be up to ${BOOKING_FOR_LIMITS.name} characters.` };
  }

  const ageNumber =
    typeof input.age === "number"
      ? input.age
      : typeof input.age === "string" && /^\d{1,3}$/.test(input.age.trim())
        ? Number(input.age.trim())
        : Number.NaN;
  if (
    !Number.isInteger(ageNumber) ||
    ageNumber < BOOKING_FOR_LIMITS.minAge ||
    ageNumber > BOOKING_FOR_LIMITS.maxAge
  ) {
    return { ok: false, error: "Please enter their age in years, for example 62." };
  }

  const relationship =
    typeof input.relationship === "string" ? cleanBookingForText(input.relationship) : "";
  if (!relationship) {
    return { ok: false, error: "Please tell us how they are related to you, for example my mother." };
  }
  if (relationship.length > BOOKING_FOR_LIMITS.relationship) {
    return {
      ok: false,
      error: `The relationship can be up to ${BOOKING_FOR_LIMITS.relationship} characters.`,
    };
  }

  if (input.someoneWithThem !== "yes" && input.someoneWithThem !== "no") {
    return { ok: false, error: "Please say whether someone will be with them on the call." };
  }

  // A child's data needs a parent's or guardian's consent (DPDP Act, s.9).
  const minor = ageNumber < GUARDIAN_AGE;
  if (minor && input.guardianConfirmed !== true) {
    return { ok: false, error: "Please confirm you are their parent or legal guardian." };
  }

  return {
    ok: true,
    value: {
      name,
      age: ageNumber,
      relationship,
      someoneWithThem: input.someoneWithThem,
      guardianConfirmed: minor,
    },
  };
}

/** The one line written ahead of the patient's own notes. */
export function bookingForLine(value: BookingFor): string {
  return (
    `${BOOKING_FOR_PREFIX} ${value.name} | age ${value.age} | ${value.relationship} | ` +
    `someone with them on the call: ${value.someoneWithThem}`
  );
}

/**
 * The notes to store: the family-member line (when there is one) above what
 * the patient typed. Null when both are empty, which is what the column held
 * before this existed.
 */
export function composeBookingNotes(value: BookingFor | null, notes: string | null | undefined): string | null {
  const own = (notes ?? "").trim();
  if (!value) return own || null;
  return own ? `${bookingForLine(value)}\n${own}` : bookingForLine(value);
}

const LINE_RE = new RegExp(
  `^${BOOKING_FOR_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} ([^|\\n]+) \\| age (\\d{1,3}) \\| ([^|\\n]+) \\| someone with them on the call: (yes|no)(?:\\n|$)`
);

/**
 * The inverse of `composeBookingNotes`, for a booking that is being resumed:
 * the wizard puts the patient's own words back in the notes box and the
 * answer back in the "Who is this for?" control, rather than showing them a
 * machine line to edit. Notes that do not start with a well-formed line come
 * back untouched.
 */
export function splitBookingNotes(stored: string | null | undefined): {
  bookingFor: BookingFor | null;
  notes: string;
} {
  const text = stored ?? "";
  const match = LINE_RE.exec(text);
  if (!match) return { bookingFor: null, notes: text };
  return {
    bookingFor: {
      name: match[1].trim(),
      age: Number(match[2]),
      relationship: match[3].trim(),
      someoneWithThem: match[4] as SomeoneWithThem,
      // Not kept in the line: a resumed booking for a child asks again.
      guardianConfirmed: false,
    },
    notes: text.slice(match[0].length).trim(),
  };
}
