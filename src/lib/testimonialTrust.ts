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
