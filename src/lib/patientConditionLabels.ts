// Condition names in a patient's words, applied at display time.
//
// `treatment_categories.title` is whatever an admin typed, and the seed names
// are the clinic's ("Spine & Posture Rehabilitation", "Post-Surgical
// Rehabilitation", a "Musculoskeletal" row on staging). A visitor looking for
// help thinks in four plain groups, so the public pages show those words
// instead -- but the rows are not renamed: bookings, prices, photographs and
// reports all hang off the real title, and an admin editing a condition should
// see the name they typed. Mapping here changes what is printed and nothing
// stored.
//
// Dependency-free so the judgement is unit-tested.

export type PatientConditionKey = "surgery" | "back-joint" | "neuro" | "children";

export type PatientConditionGroup = {
  key: PatientConditionKey;
  /** What the patient sees. */
  label: string;
  /** Titles it claims. Tested in this order, so "Post-surgical knee" is
   *  After surgery, not Back, neck & joint. */
  match: RegExp;
};

export const PATIENT_CONDITION_GROUPS: PatientConditionGroup[] = [
  { key: "surgery", label: "After surgery", match: /surg|post[- ]?op|replacement|\bacl\b|rotator|fractur/i },
  { key: "children", label: "Children", match: /paed|pedi|child|kid|infant|toddler|develop/i },
  {
    key: "neuro",
    label: "Stroke & Parkinson's",
    match: /neuro|stroke|parkinson|balance|geriatr|elder|falls?\b|mobility/i,
  },
  {
    key: "back-joint",
    label: "Back, neck & joint pain",
    match: /spine|spinal|posture|back|neck|knee|joint|shoulder|hip\b|sciatica|arthr|musculo|ortho|sport|lumbar|disc/i,
  },
];

/** The group a catalogue title belongs to, or null when it is already plain. */
export function patientConditionGroup(title: string | null | undefined): PatientConditionGroup | null {
  const t = (title ?? "").trim();
  if (!t) return null;
  return PATIENT_CONDITION_GROUPS.find((g) => g.match.test(t)) ?? null;
}

/**
 * Titles for a list of catalogue rows, in the patient's words -- but never
 * two cards with the same name. If a second row would be called "Back, neck &
 * joint pain" too, it keeps its own title: two identical headings cannot be
 * told apart, which is worse than one clinical word.
 */
export function patientConditionTitles(titles: (string | null | undefined)[]): string[] {
  const taken = new Set<string>();
  return titles.map((raw) => {
    const original = (raw ?? "").trim();
    const group = patientConditionGroup(original);
    if (!group || taken.has(group.label)) return original;
    taken.add(group.label);
    return group.label;
  });
}

export type ConditionChip = { key: PatientConditionKey; label: string; href: string };

/** The order the hero offers the four, most-searched first. */
const CHIP_ORDER: PatientConditionKey[] = ["surgery", "back-joint", "neuro", "children"];

/**
 * The home hero's tappable chips. A chip deep-links into booking with the
 * condition preselected when the catalogue has a row that group claims, and
 * never otherwise: a chip for a group the clinic has no condition for would
 * send a visitor to a picker that cannot answer them, so it is left out
 * rather than pointing at a generic /book.
 */
export function conditionChips(rows: { id: string; title: string | null }[]): ConditionChip[] {
  const out: ConditionChip[] = [];
  for (const key of CHIP_ORDER) {
    const group = PATIENT_CONDITION_GROUPS.find((g) => g.key === key)!;
    const row = rows.find((r) => patientConditionGroup(r.title)?.key === key);
    if (row) {
      out.push({ key, label: shortChipLabel(group), href: `/book?category=${encodeURIComponent(row.id)}` });
    }
  }
  return out;
}

/** "Back & joint pain" fits a chip; the full group label is for cards. */
function shortChipLabel(group: PatientConditionGroup): string {
  return group.key === "back-joint" ? "Back & joint pain" : group.label;
}
