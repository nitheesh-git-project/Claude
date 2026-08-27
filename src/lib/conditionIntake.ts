import type { PainMapRegionKey, PainMapSide } from "@/lib/painMap";
import {
  DEFAULT_CONDITION_SPECIALTY,
  parseConditionSpecialty,
  type ConditionSpecialty,
} from "@/lib/conditionSpecialty";
import { ORTHO_INTAKE_QUESTIONS } from "@/lib/intakeOrtho";
import { NEURO_INTAKE_QUESTIONS } from "@/lib/intakeNeuro";
import { PEDS_CAREGIVER_QUESTIONS, PEDS_INTAKE_QUESTIONS } from "@/lib/intakePediatrics";

// Patient Care Intake: the general (non-region) history/severity form
// behind patient_condition_profiles / condition_change_requests (see
// supabase/schema.sql). Question wording and which questions are
// mandatory can both be overridden per-question by admin
// (intake_question_templates, see mergeIntakeQuestionOverrides below) --
// the array here is the code default, not the last word.
export type IntakeQuestion = {
  key: string;
  label: string;
  inputType: "text" | "textarea" | "scale_0_10" | "area_pain_list" | "select" | "multi_select";
  required: boolean;
  /** The choices for `select` / `multi_select`. A multi_select answer is
   *  stored as the chosen options newline-joined, so it stays a plain
   *  string like every other answer and needs no special case in the
   *  storage, the required check, the diff view or the PDF. */
  options?: string[];
  /** Only for the triage set: show this question only once another
   *  question has a particular answer. Nothing in the specialty sets uses
   *  it -- a patient-facing set that hides questions can't honestly say
   *  "N of 7". */
  showWhen?: { key: string; equals: string };
  /** Two or three lines of plain-language explanation shown under the
   *  question in the step-by-step wizard: what we're asking for and why
   *  it matters clinically. Deliberately NOT admin-editable (unlike
   *  `label`/`required`) -- an admin rewording a question keeps its help
   *  text, since the help explains the intent behind the field rather
   *  than the exact wording. */
  helpText?: string;
  /** One example answer, shown as the input's placeholder. Same
   *  not-admin-editable reasoning as helpText. */
  placeholder?: string;
  /** Two or three words naming the field, for the wizard's review step
   *  and the dashboard summary, where the full question sentence is too
   *  long to read as a list. Falls back to `label` when absent. */
  shortLabel?: string;
};

// The three question sets, one per specialty. `data` is a FLAT blob shared
// by all of them -- re-triaging a patient keeps the previous specialty's
// answers rather than deleting them -- which only works while the key
// namespaces are disjoint. assertDisjointKeys below is what enforces that;
// violated silently it would cross-contaminate two patients' charts.
//
// Pediatrics carries two extra keys ahead of its seven: the caregiver's
// name and relationship. They are provenance, not clinical questions, so
// they do not spend one of the seven slots -- but they are ordinary keys
// in the same blob so that the wizard, the required check, the admin's
// question bank and the PDF all handle them with no special case.
export const INTAKE_QUESTIONS_BY_SPECIALTY: Record<ConditionSpecialty, IntakeQuestion[]> = {
  ortho: ORTHO_INTAKE_QUESTIONS,
  neuro: NEURO_INTAKE_QUESTIONS,
  pediatrics: [...PEDS_CAREGIVER_QUESTIONS, ...PEDS_INTAKE_QUESTIONS],
};

/** The questions that count towards "N of 7" and towards the seven-question
 *  cap. Pediatrics' caregiver pre-step is excluded; every other set is its
 *  whole list. */
export const CLINICAL_QUESTIONS_BY_SPECIALTY: Record<ConditionSpecialty, IntakeQuestion[]> = {
  ortho: ORTHO_INTAKE_QUESTIONS,
  neuro: NEURO_INTAKE_QUESTIONS,
  pediatrics: PEDS_INTAKE_QUESTIONS,
};

export function questionsForSpecialty(specialty: ConditionSpecialty): IntakeQuestion[] {
  return INTAKE_QUESTIONS_BY_SPECIALTY[specialty] ?? INTAKE_QUESTIONS_BY_SPECIALTY.ortho;
}

export function clinicalQuestionsForSpecialty(specialty: ConditionSpecialty): IntakeQuestion[] {
  return CLINICAL_QUESTIONS_BY_SPECIALTY[specialty] ?? CLINICAL_QUESTIONS_BY_SPECIALTY.ortho;
}

// Per-specialty rather than one scalar. `schema_version` now means "version
// of *this profile's own* set", which is what the "we've changed some of
// these questions since you answered" comparison actually wants -- bumping
// one shared number to 3 would have fired that banner on every existing
// patient's screen even though ortho's seven are byte-identical to what
// they answered. Bump a specialty's entry only when its field set changes,
// never for a wording tweak (that is already covered by the admin-editable
// override table).
export const INTAKE_QUESTIONS_VERSION_BY_SPECIALTY: Record<ConditionSpecialty, number> = {
  ortho: 2,
  neuro: 1,
  pediatrics: 1,
};

export function intakeVersionForSpecialty(specialty: ConditionSpecialty): number {
  return INTAKE_QUESTIONS_VERSION_BY_SPECIALTY[specialty] ?? 1;
}

/** Every key any specialty owns, for the merge below. */
export function questionKeysForSpecialty(specialty: ConditionSpecialty): string[] {
  return questionsForSpecialty(specialty).map((q) => q.key);
}

// Module-load guard on the disjoint-namespace rule the flat `data` blob
// depends on. Cheap (one Map build per process) and the failure it catches
// is silent and clinical: two specialties sharing a key would show one
// patient's neuro answer as their ortho answer.
(function assertDisjointKeys() {
  const seen = new Map<string, ConditionSpecialty>();
  for (const [specialty, questions] of Object.entries(INTAKE_QUESTIONS_BY_SPECIALTY) as [
    ConditionSpecialty,
    IntakeQuestion[],
  ][]) {
    for (const q of questions) {
      const owner = seen.get(q.key);
      if (owner) {
        throw new Error(
          `Intake question key "${q.key}" is used by both ${owner} and ${specialty}. ` +
            "Keys must be unique across specialties -- patient_condition_profiles.data is a flat blob."
        );
      }
      seen.set(q.key, specialty);
    }
  }
})();

/** Applies an incoming specialty's answers on top of what is already on
 *  file, keeping every key that specialty does not own.
 *
 *  This is what makes re-triage non-destructive. The approve path used to
 *  write `data: proposedData` outright, which would delete a patient's
 *  whole orthopaedic record the moment a neurological one was written for
 *  them. Keys the incoming set owns are always set, including to "" -- the
 *  wizard submits its full key set every time, so clearing an answer has
 *  to keep working. */
export function mergeSpecialtyAnswers(
  existing: Record<string, string> | null | undefined,
  proposed: Record<string, string>,
  incomingKeys: string[]
): Record<string, string> {
  const owned = new Set(incomingKeys);
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(existing ?? {})) {
    if (!owned.has(key)) merged[key] = value;
  }
  for (const key of incomingKeys) {
    merged[key] = proposed[key] ?? "";
  }
  return merged;
}

export type ConditionProfileStatus = "not_started" | "draft" | "pending_review" | "active";

export const CONDITION_STATUS_LABEL: Record<ConditionProfileStatus, string> = {
  not_started: "Not started",
  draft: "Draft — not submitted",
  pending_review: "Pending admin review",
  active: "Complete",
};

// `note` is optional and freeform -- e.g. "started after a fall" -- so the
// picker isn't just a bare number with no context. Older stored entries
// from before this field existed simply parse with note undefined.
export type AreaPainEntry = { region: PainMapRegionKey; side: PainMapSide; pain: number; note?: string };

/** Parses the JSON string stored under the "area_pain" answer key. Never
 *  throws -- a malformed or empty value just reads as no areas picked. */
export function parseAreaPain(raw: string | undefined | null): AreaPainEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is AreaPainEntry =>
          e && typeof e.region === "string" && typeof e.side === "string" && typeof e.pain === "number"
      )
      .map((e) => (typeof e.note === "string" && e.note.trim() ? e : { ...e, note: undefined }));
  } catch {
    return [];
  }
}

export function serializeAreaPain(entries: AreaPainEntry[]): string {
  return JSON.stringify(entries);
}

// A multi_select answer is stored as its chosen options newline-joined,
// so it is a plain string like every other answer -- nothing in storage,
// the required check, the admin diff view or the PDF needs a special case
// for it, and an old value from before the question existed reads as an
// empty selection rather than throwing.
export function parseMultiSelect(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function serializeMultiSelect(values: string[]): string {
  return values.filter(Boolean).join("\n");
}

/** Spells an `area_pain` answer out as readable lines. Extracted so the
 *  admin's review card, the PDF and anything else printing this answer
 *  share one formatter rather than each growing their own -- the PDF used
 *  to dump the raw JSON. */
export function formatAreaPainForText(
  entries: AreaPainEntry[],
  regionLabel: (region: string) => string
): string[] {
  return entries.map((e) => {
    const side = e.side !== "na" ? ` (${e.side})` : "";
    const note = e.note ? ` — “${e.note}”` : "";
    return `${regionLabel(e.region)}${side}: ${e.pain}/10${note}`;
  });
}

export type IntakeQuestionOverrideRow = {
  question_key: string;
  question_text: string;
  required: boolean;
  /** Null on rows written before the bank became per-specialty; those are
   *  the orthopaedic overrides, since ortho is all there was. */
  specialty?: string | null;
};

/** Applies admin-edited wording/required-ness from intake_question_templates
 *  on top of the code defaults -- same merge shape as painMap.ts's
 *  mergeQuestionOverrides, but also carries `required` since that's
 *  admin-editable here too (Pain Map has no per-question required concept). */
export function mergeIntakeQuestionOverrides(
  defaults: IntakeQuestion[],
  overrides: IntakeQuestionOverrideRow[],
  specialty: ConditionSpecialty = DEFAULT_CONDITION_SPECIALTY
): IntakeQuestion[] {
  // Filtering by specialty is belt-and-braces given the key namespaces are
  // disjoint -- but it means a future violation of that rule degrades to
  // "override ignored" rather than "another specialty's wording on this
  // patient's chart".
  const overrideByKey = new Map(
    overrides
      .filter((o) => parseConditionSpecialty(o.specialty) === specialty)
      .map((o) => [o.question_key, o])
  );
  return defaults.map((q) => {
    const override = overrideByKey.get(q.key);
    if (!override) return q;
    return { ...q, label: override.question_text, required: override.required };
  });
}

/** True if every required question (per the merged question list) has a
 *  non-empty answer -- an empty area_pain array counts as empty. Shared by
 *  the client form and both submit routes so client/server never disagree
 *  about what "filled in" means. */
export function findMissingRequiredKeys(
  questions: IntakeQuestion[],
  answers: Record<string, string>
): string[] {
  return questions
    .filter((q) => q.required)
    .filter((q) => {
      const value = answers[q.key];
      if (q.inputType === "area_pain_list") {
        return parseAreaPain(value).length === 0;
      }
      if (q.inputType === "multi_select") {
        return parseMultiSelect(value).length === 0;
      }
      return !value || !value.trim();
    })
    .map((q) => q.key);
}

/** True when a question has a usable answer -- the same emptiness rule
 *  findMissingRequiredKeys applies, but for any question rather than only
 *  the required ones. Used for the "4 of 7 answered" progress the wizard
 *  and the dashboard summary both show. */
export function isAnswered(question: IntakeQuestion, answers: Record<string, string>): boolean {
  const value = answers[question.key];
  if (question.inputType === "area_pain_list") return parseAreaPain(value).length > 0;
  if (question.inputType === "multi_select") return parseMultiSelect(value).length > 0;
  return !!value && !!value.trim();
}

export function countAnswered(questions: IntakeQuestion[], answers: Record<string, string>): number {
  return questions.filter((q) => isAnswered(q, answers)).length;
}

// --- The patient's write gate --------------------------------------------
//
// The patient no longer opens their own record: a therapist fills it in at
// the first session, and that fill is what unlocks them. Returning a
// discriminated union rather than a boolean is deliberate -- "not yours to
// do" and "you can't right now" need different copy, and a single `locked`
// flag is how a screen ends up telling a patient they are behind on
// something nobody has asked them for yet.
//
// "The therapist's first fill has landed" is exactly "data is non-empty".
// That is the right signal in both directions: it flips the moment the
// therapist submits (their write goes live, no review in between), and an
// existing patient who filled their own intake before this change stays
// unlocked with no special case.
export type PatientIntakeGate =
  | { canEdit: true; reason: "editable" }
  | { canEdit: false; reason: "awaiting_therapist" }
  | { canEdit: false; reason: "pending_review" };

export function patientIntakeGate(profile: {
  data?: Record<string, string> | null;
  status?: string | null;
} | null | undefined): PatientIntakeGate {
  const answers = profile?.data ?? {};
  const hasRecord = Object.values(answers).some((v) => typeof v === "string" && v.trim());
  if (!hasRecord) return { canEdit: false, reason: "awaiting_therapist" };
  if (profile?.status === "pending_review") return { canEdit: false, reason: "pending_review" };
  return { canEdit: true, reason: "editable" };
}
