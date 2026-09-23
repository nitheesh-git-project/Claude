// What a therapist is a specialist in, as a value the app can group by
// rather than a sentence each person types differently.
//
// `profiles.specialization` has always been free text, written once on the
// therapist's own profile screen and printed raw on /team. That was enough
// while it was a line of prose on one page; it stopped being enough the
// moment an admin needed to answer "who do we have for a stroke patient?",
// because "Neuro rehab", "neurological physiotherapy" and "Neuro" are three
// different strings and no dropdown can be built out of them.
//
// The column is unchanged and still text: what is stored is the canonical
// **label** (`"Orthopaedic"`, not `"ortho"`). Storing the label rather than
// a slug is what keeps every surface that already printed the column raw --
// the profile change-request card, an export, a screen nobody has touched --
// correct with no edit, and it means a therapist who was already described
// as "Orthopaedic" needs no backfill. The slug exists for filtering and for
// the chip colour, and is derived, never stored.
//
// Free text that predates this, or that somebody wrote in the database by
// hand, is honoured rather than blanked: it renders exactly as it was
// written and files under "Something else" in the filter. The list here is
// the one an admin and a therapist may pick from.

export type TherapistSpecialtyKey =
  | "orthopaedic"
  | "neurological"
  | "paediatric"
  | "sports"
  | "geriatric"
  | "cardiopulmonary"
  | "womens_health"
  | "general";

export type TherapistSpecialtyDef = {
  key: TherapistSpecialtyKey;
  /** What is written into `profiles.specialization`, and what every screen
   *  shows. British spelling throughout, matching the condition types --
   *  "Orthopedic" on one screen and "Orthopaedic" on the next reads as a
   *  typo rather than as two words. */
  label: string;
  /** One line for the picker: who this therapist takes. */
  blurb: string;
  icon: string;
  /** Decided once, so the chip is the same colour on /team, in the admin
   *  directory and on the roster. */
  chipClass: string;
};

export const THERAPIST_SPECIALTIES: TherapistSpecialtyDef[] = [
  {
    key: "orthopaedic",
    label: "Orthopaedic",
    blurb: "Pain, injury, joints, muscles, post-surgical recovery.",
    icon: "fa-bone",
    chipClass: "border-teal-200 bg-teal-50 text-teal-700",
  },
  {
    key: "neurological",
    label: "Neurological",
    blurb: "Stroke, spinal or brain injury, Parkinson's, MS, neuropathy.",
    icon: "fa-brain",
    chipClass: "border-violet-200 bg-violet-50 text-violet-700",
  },
  {
    key: "paediatric",
    label: "Paediatric",
    blurb: "Children: milestones, posture, cerebral palsy, birth injury.",
    icon: "fa-child-reaching",
    chipClass: "border-amber-200 bg-amber-50 text-amber-800",
  },
  {
    key: "sports",
    label: "Sports",
    blurb: "Athletes: return to play, conditioning, repeat injury.",
    icon: "fa-person-running",
    chipClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  {
    key: "geriatric",
    label: "Geriatric",
    blurb: "Older patients: balance, falls, mobility, arthritis.",
    icon: "fa-person-cane",
    chipClass: "border-sky-200 bg-sky-50 text-sky-700",
  },
  {
    key: "cardiopulmonary",
    label: "Cardiopulmonary",
    blurb: "Heart and lung rehabilitation, breathlessness, post-ICU.",
    icon: "fa-lungs",
    chipClass: "border-rose-200 bg-rose-50 text-rose-700",
  },
  {
    key: "womens_health",
    label: "Women's health",
    blurb: "Pregnancy, post-natal recovery, pelvic floor.",
    icon: "fa-person-pregnant",
    chipClass: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
  },
  {
    key: "general",
    label: "General physiotherapy",
    blurb: "No single focus - takes whoever needs seeing.",
    icon: "fa-user-doctor",
    chipClass: "border-slate-200 bg-slate-100 text-slate-700",
  },
];

/** The filter's two non-specialty options. `other` is free text somebody
 *  wrote before this list existed; `none` is nobody having said. They are
 *  separate because they ask for different work -- one is a value to tidy
 *  up, the other is a value to collect. */
export const SPECIALTY_FILTER_ALL = "all";
export const SPECIALTY_FILTER_OTHER = "other";
export const SPECIALTY_FILTER_NONE = "none";

const BY_KEY = new Map(THERAPIST_SPECIALTIES.map((s) => [s.key, s]));

// Everything that has to resolve to one of the eight. Deliberately an
// explicit table rather than a "contains" rule: guessing that "sports
// injury clinic - neuro trained" is one of these is how a therapist ends up
// filed under something nobody chose, and the honest answer for a string
// nobody recognises is to leave it alone and show it as written.
const ALIASES: Record<string, TherapistSpecialtyKey> = {
  ortho: "orthopaedic",
  orthopedic: "orthopaedic",
  orthopaedic: "orthopaedic",
  orthopedics: "orthopaedic",
  orthopaedics: "orthopaedic",
  musculoskeletal: "orthopaedic",
  msk: "orthopaedic",
  neuro: "neurological",
  neurology: "neurological",
  neurological: "neurological",
  neurorehab: "neurological",
  neurorehabilitation: "neurological",
  paediatric: "paediatric",
  paediatrics: "paediatric",
  pediatric: "paediatric",
  pediatrics: "paediatric",
  peds: "paediatric",
  sport: "sports",
  sports: "sports",
  sportsinjury: "sports",
  sportsmedicine: "sports",
  geriatric: "geriatric",
  geriatrics: "geriatric",
  elderly: "geriatric",
  cardio: "cardiopulmonary",
  cardiopulmonary: "cardiopulmonary",
  cardiorespiratory: "cardiopulmonary",
  respiratory: "cardiopulmonary",
  womenshealth: "womens_health",
  womenhealth: "womens_health",
  womens: "womens_health",
  pelvicfloor: "womens_health",
  general: "general",
  generalphysiotherapy: "general",
  generalphysio: "general",
};

function canonicalise(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z]/g, "");
}

/** The specialty a stored value means, or null when it means nothing this
 *  list knows about -- including the empty string, which is what an
 *  unanswered column holds. */
export function normalizeSpecialty(raw: string | null | undefined): TherapistSpecialtyKey | null {
  if (typeof raw !== "string") return null;
  const key = canonicalise(raw);
  if (!key) return null;
  return ALIASES[key] ?? null;
}

/** What to print. A recognised value prints the canonical label -- so a
 *  legacy "neuro rehab" reads "Neurological" wherever it is shown -- and
 *  anything else prints as its author wrote it, trimmed. Null means print
 *  nothing: a therapist who has not said is not "Unknown", and a chip
 *  saying so on every profile is noise. */
export function specialtyLabel(raw: string | null | undefined): string | null {
  const key = normalizeSpecialty(raw);
  if (key) return BY_KEY.get(key)!.label;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed || null;
}

export function specialtyDef(raw: string | null | undefined): TherapistSpecialtyDef | null {
  const key = normalizeSpecialty(raw);
  return key ? BY_KEY.get(key)! : null;
}

/** The chip's classes, including for free text -- which gets the neutral
 *  one rather than no chip, or an unrecognised specialty would look like a
 *  different kind of fact from a recognised one. */
export function specialtyChipClass(raw: string | null | undefined): string {
  return specialtyDef(raw)?.chipClass ?? "border-slate-200 bg-slate-100 text-slate-700";
}

export function specialtyIcon(raw: string | null | undefined): string {
  return specialtyDef(raw)?.icon ?? "fa-user-doctor";
}

/** Does this therapist's stored value match what the filter is asking for?
 *  The filter is the `key` of a specialty, or one of the two buckets. */
export function matchesSpecialtyFilter(
  raw: string | null | undefined,
  filter: string
): boolean {
  if (filter === SPECIALTY_FILTER_ALL) return true;
  const key = normalizeSpecialty(raw);
  if (filter === SPECIALTY_FILTER_NONE) return specialtyLabel(raw) === null;
  if (filter === SPECIALTY_FILTER_OTHER) return key === null && specialtyLabel(raw) !== null;
  return key === filter;
}

export type SpecialtyFilterOption = { value: string; label: string; count: number };

/** The options a filter should offer for the people actually on screen.
 *  Built from the rows rather than from the list, for the reason every
 *  other filter in this dashboard is: an option that matches nothing is a
 *  dead end, and a count is what tells somebody whether it is worth
 *  opening. "Any specialisation" is always first and always present. */
export function specialtyFilterOptions(
  values: (string | null | undefined)[]
): SpecialtyFilterOption[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = normalizeSpecialty(value);
    const bucket = key ?? (specialtyLabel(value) === null ? SPECIALTY_FILTER_NONE : SPECIALTY_FILTER_OTHER);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  const options: SpecialtyFilterOption[] = [
    { value: SPECIALTY_FILTER_ALL, label: "Any specialisation", count: values.length },
  ];
  for (const spec of THERAPIST_SPECIALTIES) {
    const count = counts.get(spec.key) ?? 0;
    if (count > 0) options.push({ value: spec.key, label: spec.label, count });
  }
  const other = counts.get(SPECIALTY_FILTER_OTHER) ?? 0;
  if (other > 0) {
    options.push({ value: SPECIALTY_FILTER_OTHER, label: "Something else", count: other });
  }
  const none = counts.get(SPECIALTY_FILTER_NONE) ?? 0;
  if (none > 0) {
    options.push({ value: SPECIALTY_FILTER_NONE, label: "Not set", count: none });
  }
  return options;
}

/** What a picker may offer, and what a route accepts. A route re-derives
 *  this rather than trusting the browser -- the same rule every other
 *  admin-configured value follows. */
export const THERAPIST_SPECIALTY_LABELS = THERAPIST_SPECIALTIES.map((s) => s.label);

/** The value to store for something a picker sent. Returns the canonical
 *  label for anything recognised, null for blank, and the trimmed text for
 *  free text the database already holds -- capped, since this is a column
 *  every public profile prints. */
export const MAX_SPECIALTY_LENGTH = 80;

export function storableSpecialty(raw: string | null | undefined): string | null {
  const def = specialtyDef(raw);
  if (def) return def.label;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_SPECIALTY_LENGTH);
}
