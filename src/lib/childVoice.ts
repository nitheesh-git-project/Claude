// The parent's voice for the shared progress components.
//
// The orthopaedic and neurological pages speak to the patient ("your
// progress", "your physiotherapist"). On a paediatric record the reader is a
// parent and the patient is the child, so the same sentences must say "your
// child's progress". The shared components keep ONE set of patient-voice
// sentences and are handed `subject`; this turns a sentence into its parent
// form. A rule list, not a second copy of every string, so a new sentence in
// a shared component is covered by the same rules - and childVoice.test.ts
// walks the status reasons to catch one the rules miss.

const NOUNS =
  "physiotherapist|goal|progress|measures|measure|measurements|main measure|first review|latest review|latest reading|latest numbers|steps|plan|next visit|next review|balance";

const RULES: [RegExp, string | ((...m: string[]) => string)][] = [
  [/\bWhere you are in your care\b/g, "Where your child is in their care"],
  [/\(you are here\)/g, "(your child is here)"],
  [/\bAre you getting better\?/g, "Is your child getting better?"],
  [/\bhow you are doing\b/g, "how your child is doing"],
  [/\bwhich stage you are in\b/g, "which stage your child is in"],
  [/\bmeasured you\b/g, "measured your child"],
  [/\bwith you, in your own words\b/g, "with you"],
  [/\bat your latest review\b/g, "at their latest review"],
  [
    new RegExp(`\\b([Yy])our (${NOUNS})\\b`, "g"),
    (_m, y, noun) => `${y}our child's ${noun}`,
  ],
];

/** A patient-voice sentence in the parent's voice ("your physiotherapist" ->
 *  "your child's physiotherapist"). Text with nothing to change is returned
 *  as it came. */
export function childWords(text: string): string {
  let out = text;
  for (const [pattern, replacement] of RULES)
    out = out.replace(pattern, replacement as never);
  return out;
}

/**
 * Who a patient-voice sentence is about, from the reader's side
 * (Health Profile redesign, phase 6a -- it replaced a boolean `child` prop
 * on the shared progress components):
 *  - "self": the reader is the patient ("your progress"). Every profile but
 *    the paediatric one, including Strength and balance care, where a carer
 *    may sit beside the patient but the record still speaks to the patient
 *    (the carer gets a line in the header, not a voice of their own).
 *  - "child": the reader is a parent and the patient their child ("your
 *    child's progress").
 * Two values, not three: a carer reading on the patient's behalf is still
 * read to as "you" about the patient's own body, and a third voice nobody
 * yet needs is a third copy of every sentence to keep right. A union rather
 * than a boolean so that one can be added without touching every prop.
 */
export type ProfileSubject = "self" | "child";

/** The helper the components use: the parent's form for a child's record
 *  in the patient voice, and the sentence unchanged otherwise -- clinician
 *  text is never rewritten, whatever the subject. */
export function subjectWords(
  subject: ProfileSubject | undefined,
  voice: "patient" | "clinician" = "patient",
): (text: string) => string {
  return subject === "child" && voice === "patient" ? childWords : (text) => text;
}

/** Whether the parent's voice applies: a child's record, read in the
 *  patient voice. For the few sentences a component chooses whole rather
 *  than rewrites ("Your child's measures"). */
export function speaksToParent(subject: ProfileSubject | undefined, voice: "patient" | "clinician"): boolean {
  return subject === "child" && voice === "patient";
}
