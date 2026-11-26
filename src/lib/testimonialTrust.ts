// Which testimonials may be shown to the public.
//
// `schema.sql` seeds five testimonials into an empty table so the Home and
// Mission bands can be reviewed populated before launch. Its own comment calls
// them ILLUSTRATIVE COPY, not real patients -- yet they rendered on the live
// site with names, photographs and five gold stars, which is exactly the kind
// of claim a hesitant patient weighs hardest. There is no `is_sample` column
// on the table to tell them apart, so the seed's own wording is the marker: a
// row whose quote is still one of the seeded sentences is the seed, and an
// admin who rewrites the words (or deletes the row) has made it theirs.
//
// Seeded rows are never shown. If they are all there is, the band is not drawn
// at all; a real testimonial added beside them shows on its own. The owner
// adds real ones (with consent for the words and the face) in Settings ->
// Site Content. Dependency-free; the test pins the list to schema.sql.

export const SEEDED_TESTIMONIAL_QUOTES: string[] = [
  "I had given up on fixing my neck between meetings. He watched me sit at my actual desk, moved two things, and gave me four exercises. The headaches stopped in about three weeks.",
  "I expected to be told to rest. Instead I got a week-by-week plan that kept me moving, and a straight answer about when I could race again. I did the half marathon.",
  "After the knee replacement I could not face the drive to a clinic twice a week. Same physiotherapist every session, from my living room. She could see the stairs I was struggling with.",
  "My daughter sat in on the first call and we both learned the routine. Six months on I am steadier on my feet than I was, and she is not worrying every time I use the stairs.",
  "The assessment was an hour and nobody rushed me. What I remember is being told exactly what was wrong in words I understood, and leaving with something to do about it that day.",
];

function norm(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

const SEEDED = new Set(SEEDED_TESTIMONIAL_QUOTES.map(norm));

/** Whether this row is still the illustrative copy the schema seeds. */
export function isSeededTestimonial(row: { quote?: string | null }): boolean {
  return SEEDED.has(norm(row.quote));
}

/** The rows fit to show: everything except the seeded illustrations. */
export function publicTestimonials<T extends { quote?: string | null }>(rows: T[] | null | undefined): T[] {
  return (rows ?? []).filter((row) => !isSeededTestimonial(row));
}

/**
 * A patient story is published only with the patient's written consent on
 * file (owner's rule): their words, their name and, if there is one, their
 * photograph. An admin records it on the story -- when, and where the signed
 * consent is kept (`testimonials.consent_recorded_at`, `consent_note`) -- and
 * a story without it is never shown, whatever its Active switch says. The
 * database's public read policy says the same, so this is the second lock.
 *
 * `consented` is the set of story ids with consent recorded, read on its own;
 * null means it could not be read (a database without the columns, a failed
 * read), and then nothing is shown. "Couldn't check" is not "yes" -- for a
 * patient's health story the safe answer is to wait.
 */
export function consentedPublicTestimonials<T extends { id: string; quote?: string | null }>(
  rows: T[] | null | undefined,
  consented: ReadonlySet<string> | null
): T[] {
  if (!consented) return [];
  return publicTestimonials(rows).filter((row) => consented.has(row.id));
}

/** The shortest "where is the signed consent kept" note a story accepts. */
export const MIN_CONSENT_NOTE = 5;
/** The longest, matching the column's check. */
export const MAX_CONSENT_NOTE = 500;

/** Why a story cannot be switched on, or null when it can. */
export function testimonialActivationBlock(args: {
  active: boolean;
  consentGiven: boolean;
  consentNote: string | null | undefined;
}): string | null {
  if (args.consentGiven && (args.consentNote ?? "").trim().length > MAX_CONSENT_NOTE) {
    return `Keep the note on where the consent is kept to ${MAX_CONSENT_NOTE} characters.`;
  }
  if (args.consentGiven && (args.consentNote ?? "").trim().length < MIN_CONSENT_NOTE) {
    return "Say where the signed consent is kept (for example: \"Signed form, 12 Dec, patient file\").";
  }
  if (args.active && !args.consentGiven) {
    return "A story is shown only with the patient's written consent on file. Record it first, or leave the story hidden.";
  }
  return null;
}
