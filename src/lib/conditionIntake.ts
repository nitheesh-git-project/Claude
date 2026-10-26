import type { PainMapRegionKey, PainMapSide } from "@/lib/painMap";
import {
  DEFAULT_CONDITION_SPECIALTY,
  parseConditionSpecialty,
  type ConditionSpecialty,
} from "@/lib/conditionSpecialty";
import { ORTHO_INTAKE_QUESTIONS } from "@/lib/intakeOrtho";
import { NEURO_INTAKE_QUESTIONS } from "@/lib/intakeNeuro";
import { PEDS_CAREGIVER_QUESTIONS, PEDS_INTAKE_QUESTIONS } from "@/lib/intakePediatrics";
import { GERI_CARER_QUESTIONS, GERI_INTAKE_QUESTIONS } from "@/lib/intakeGeriatric";
import { CARDIO_INTAKE_QUESTIONS } from "@/lib/intakeCardio";

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
  /** True for a question that is asked but does not count towards "N of
   *  7" -- the paediatric caregiver pre-step and the geriatric carer
   *  pre-step. Who is speaking for the patient is provenance, not a
   *  clinical question, so counting it would make that set read as nine
   *  questions when the cap is seven. Its `required` still applies (the
   *  paediatric pair is required, the geriatric carer optional); this
   *  governs the progress figures only. */
  excludeFromCount?: boolean;
  /** Ask this question only once an EARLIER question in the same set has
   *  a particular answer -- triage's development question (children only),
   *  and the neurological set's Parkinson's follow-ups (only when
   *  `neuro_subtype` is "Parkinson's disease"). Evaluated by
   *  `visibleQuestions()` and nowhere else, so the wizard, the triage
   *  dialog, the summary panel, the required check, the "N of M" counters,
   *  the admin's question bank and the PDF all agree. A hidden question is
   *  never "unanswered" and never "required"; its stored answer is kept
   *  (the flat blob never deletes) but not shown. The module-load
   *  assertion below refuses a `showWhen` naming a later or unknown
   *  question, or an answer the controlling question cannot give. */
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
  /** For a `multi_select`: the options that mean "none of the others" --
   *  triage's "None of these". Ticking one clears every other option, and
   *  ticking any other clears it, so the answer can never claim both "no
   *  neurological signs" and "weakness on one side". Enforced in the UI by
   *  toggleMultiSelectOption and on the server by
   *  findContradictoryMultiSelects -- the browser is never the authority. */
  exclusiveOptions?: string[];
};

// The question sets, one per specialty (five since phase 6a). `data` is a FLAT blob shared
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
  // Phase 6a. The geriatric carer pair is a pre-step like the paediatric
  // caregiver's, but optional: the patient usually speaks for themselves.
  geriatric: [...GERI_CARER_QUESTIONS, ...GERI_INTAKE_QUESTIONS],
  cardiopulmonary: CARDIO_INTAKE_QUESTIONS,
};

/** The questions that count towards "N of 7" and towards the seven-question
 *  cap. The paediatric caregiver and the geriatric carer pre-steps are
 *  excluded; every other set is its whole list. */
export const CLINICAL_QUESTIONS_BY_SPECIALTY: Record<ConditionSpecialty, IntakeQuestion[]> = {
  ortho: ORTHO_INTAKE_QUESTIONS,
  neuro: NEURO_INTAKE_QUESTIONS,
  pediatrics: PEDS_INTAKE_QUESTIONS,
  geriatric: GERI_INTAKE_QUESTIONS,
  cardiopulmonary: CARDIO_INTAKE_QUESTIONS,
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
//
// neuro 2 (Health Profile redesign, phase 4a): `neuro_subtype` and the
// Parkinson's follow-ups. The subtype is optional and every follow-up is
// hidden until it reads Parkinson's, so an existing neurological record is
// exactly as complete under v2 as it was under v1 -- and the banner below
// (`intakeNeedsAnotherLook`) fires only when a now-required visible
// question is unanswered, so it does not nag those patients either.
export const INTAKE_QUESTIONS_VERSION_BY_SPECIALTY: Record<ConditionSpecialty, number> = {
  ortho: 2,
  neuro: 2,
  // 2: peds_weeks_at_birth (optional, at the end of the set; phase 5a).
  pediatrics: 2,
  // 1: the sets as they first shipped (phase 6a).
  geriatric: 1,
  cardiopulmonary: 1,
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
    assertShowWhenWellFormed(questions, specialty);
  }
})();

/** A `showWhen` must name an EARLIER question of the same set (the wizard
 *  asks in order, so a later controller would leave the follow-up hidden
 *  for good), and for a select its `equals` must be one of that question's
 *  options (an answer nobody can give would hide the follow-up silently).
 *  Exported for the triage set's test. */
export function assertShowWhenWellFormed(questions: readonly IntakeQuestion[], setName: string): void {
  const earlier = new Map<string, IntakeQuestion>();
  for (const q of questions) {
    if (q.showWhen) {
      const controller = earlier.get(q.showWhen.key);
      if (!controller) {
        throw new Error(
          `Intake question "${q.key}" (${setName}) is shown when "${q.showWhen.key}" is answered, ` +
            "but that question is not earlier in the same set."
        );
      }
      if (
        controller.options &&
        !controller.options.some((o) => normaliseIntakeAnswer(o) === normaliseIntakeAnswer(q.showWhen!.equals))
      ) {
        throw new Error(
          `Intake question "${q.key}" (${setName}) waits for "${q.showWhen.equals}", ` +
            `which is not one of "${controller.key}"'s options.`
        );
      }
    }
    earlier.set(q.key, q);
  }
}

/** Typographic apostrophes, case and stray spacing are the same answer, so
 *  a pasted "Parkinson’s disease" still opens the Parkinson's follow-ups
 *  (the rule profileKind.ts applies to the same key). */
export function normaliseIntakeAnswer(value: string): string {
  return value.replace(/[\u2018\u2019\u02bc]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The questions actually asked, given the answers so far, in order. A
 * question with a `showWhen` is asked when its controlling question is
 * itself asked and answered with `equals` (one pass is enough: the
 * assertion above keeps every controller earlier in the list). A
 * controller missing from the list -- a caller passing a filtered slice --
 * is judged on the answer alone.
 *
 * The one place visibility is decided. The counters, the required check
 * and every surface that lists questions go through it.
 */
export function visibleQuestions<Q extends Pick<IntakeQuestion, "key" | "showWhen">>(
  questions: readonly Q[],
  answers: Readonly<Record<string, string | undefined>>
): Q[] {
  const listed = new Set(questions.map((q) => q.key));
  const shown = new Set<string>();
  const out: Q[] = [];
  for (const q of questions) {
    const rule = q.showWhen;
    const visible =
      !rule ||
      ((!listed.has(rule.key) || shown.has(rule.key)) &&
        typeof answers[rule.key] === "string" &&
        normaliseIntakeAnswer(answers[rule.key] as string) === normaliseIntakeAnswer(rule.equals));
    if (visible) {
      out.push(q);
      shown.add(q.key);
    }
  }
  return out;
}

/** Whether one question is asked, given the whole set and the answers. */
export function isQuestionVisible(
  question: Pick<IntakeQuestion, "key" | "showWhen">,
  questions: readonly Pick<IntakeQuestion, "key" | "showWhen">[],
  answers: Readonly<Record<string, string | undefined>>
): boolean {
  return visibleQuestions(questions, answers).some((q) => q.key === question.key);
}

/** The admin question bank's note under a conditional question: which
 *  question and answer open it. Null for a question that is always asked. */
export function describeShowWhen(question: IntakeQuestion, questions: readonly IntakeQuestion[]): string | null {
  if (!question.showWhen) return null;
  const controller = questions.find((q) => q.key === question.showWhen!.key);
  const name = controller ? controller.shortLabel ?? controller.label : question.showWhen.key;
  return `Asked only when "${name}" is "${question.showWhen.equals}".`;
}

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

/**
 * What a therapist's intake fill for `specialty` opens with.
 *
 * Re-triage keeps the previous specialty's answers on file (see
 * mergeSpecialtyAnswers), but the wizard used to open blank anyway, so a
 * patient taken orthopaedic -> neurological -> back to orthopaedic had their
 * orthopaedic history typed in again from nothing while the old answers sat
 * hidden in the same blob. The owner's rule: their latest answers for that
 * specialty prefill the questions, ready to edit. Saving still goes through
 * /onboard, which writes a new approved history entry and changes nothing
 * already recorded.
 *
 * In order:
 *  1. An unfinished fill for this same specialty (the draft) -- the newest
 *     thing the therapist typed, and the wizard saves its full key set, so
 *     it already started from the answers below.
 *  2. The answers on file for this specialty -- the latest, since every
 *     write merges them in.
 *  3. Nothing.
 * Only this specialty's own keys come back, and never an empty value: a
 * neurological draft must not seed an orthopaedic form (the keys are
 * disjoint, so it would silently submit nothing), and a blank string is
 * not an answer to prefill.
 */
export function intakePrefillAnswers({
  specialty,
  onFile,
  draft,
  draftSpecialty,
}: {
  specialty: ConditionSpecialty;
  onFile?: Record<string, string> | null;
  draft?: Record<string, string> | null;
  draftSpecialty?: ConditionSpecialty | null;
}): Record<string, string> {
  const keys = questionKeysForSpecialty(specialty);
  const pick = (source: Record<string, string> | null | undefined) =>
    Object.fromEntries(
      keys
        .map((k) => [k, source?.[k]] as const)
        .filter((entry): entry is readonly [string, string] => typeof entry[1] === "string" && !!entry[1].trim())
    ) as Record<string, string>;
  const fromDraft = draftSpecialty === specialty ? pick(draft) : {};
  if (Object.keys(fromDraft).length > 0) return fromDraft;
  return pick(onFile);
}

export type ConditionProfileStatus = "not_started" | "draft" | "pending_review" | "active";

export const CONDITION_STATUS_LABEL: Record<ConditionProfileStatus, string> = {
  not_started: "Not started",
  draft: "Draft - not submitted",
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

/** The selection after tapping `option`. A tapped option already selected
 *  is removed; otherwise it is added -- and if it is one of the question's
 *  `exclusiveOptions` it replaces everything else, while any other option
 *  clears the exclusive ones. Triage used to toggle each option on its own,
 *  so "None of these" followed by "Weakness on one side" left both ticked
 *  and the record contradicting itself. */
export function toggleMultiSelectOption(
  question: Pick<IntakeQuestion, "exclusiveOptions">,
  current: string[],
  option: string
): string[] {
  if (current.includes(option)) return current.filter((c) => c !== option);
  const exclusive = question.exclusiveOptions ?? [];
  if (exclusive.includes(option)) return [option];
  return [...current.filter((c) => !exclusive.includes(c)), option];
}

/** Keys of the multi_select answers that tick an exclusive option ("None of
 *  these") alongside anything else. The server half of
 *  toggleMultiSelectOption: a request is refused rather than normalised,
 *  because which half of a contradiction the clinician meant is not
 *  something a route can guess. */
export function findContradictoryMultiSelects(
  questions: IntakeQuestion[],
  answers: Record<string, string>
): string[] {
  return questions
    .filter((q) => q.inputType === "multi_select" && (q.exclusiveOptions?.length ?? 0) > 0)
    .filter((q) => {
      const picked = parseMultiSelect(answers[q.key]);
      return picked.length > 1 && picked.some((p) => q.exclusiveOptions!.includes(p));
    })
    .map((q) => q.key);
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
    const note = e.note ? ` - “${e.note}”` : "";
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
  // A question the answers so far do not ask is never missing: a stroke
  // patient is not refused for leaving the Parkinson's follow-ups blank.
  return visibleQuestions(questions, answers)
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

/** The questions that count towards the progress figures: the ones the
 *  answers so far actually ask (`visibleQuestions`), less a pre-step like
 *  the paediatric caregiver pair. Every surface that prints "N of M" runs
 *  through this, so a hidden follow-up is never counted as unanswered and
 *  the total grows honestly when one opens ("of 8" for most neurological
 *  patients, "of 13" once the condition group reads Parkinson's).
 *  `answers` is required on purpose: a count without them cannot know
 *  which questions are asked. */
export function countedQuestions(
  questions: IntakeQuestion[],
  answers: Readonly<Record<string, string | undefined>>
): IntakeQuestion[] {
  return visibleQuestions(questions, answers).filter((q) => !q.excludeFromCount);
}

export function countAnswered(questions: IntakeQuestion[], answers: Record<string, string>): number {
  return countedQuestions(questions, answers).filter((q) => isAnswered(q, answers)).length;
}

/**
 * Whether the "we've changed some of these questions since you answered"
 * banner is worth showing: the record is live, it was answered under an
 * older version of this specialty's set, AND a question that is asked and
 * required now has no answer. An older version alone is not enough -- the
 * neurological set's v2 added only optional or hidden questions, and a
 * banner sending every existing neurological patient to look at a record
 * that is already complete is a nag, not news. The admin's chart still
 * prints the version it was answered under.
 */
export function intakeNeedsAnotherLook(input: {
  status: string | null | undefined;
  schemaVersion: number | null | undefined;
  currentVersion: number;
  questions: IntakeQuestion[];
  answers: Record<string, string>;
}): boolean {
  if (input.status !== "active") return false;
  if (typeof input.schemaVersion !== "number" || input.schemaVersion >= input.currentVersion) return false;
  return findMissingRequiredKeys(input.questions, input.answers).length > 0;
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

/**
 * Whether a submission would leave the record exactly as it already is.
 *
 * This exists because of a real double-audit bug, and the mechanism is worth
 * keeping written down. `/api/therapist/condition-profile/onboard` claims the
 * record with a compare-and-swap so only the caller whose write lands writes
 * the audit row -- but it has two paths, an INSERT when no record exists and
 * an UPDATE when one does, and they guard different races. Ten concurrent
 * taps split across them: the callers that read before the row existed race
 * on the insert (one wins), and the callers that read after it race on the
 * update (one wins). Two winners, so the admin's Review History showed the
 * onboarding **twice** -- the same bug the CAS was added to fix, reduced from
 * ten to two rather than to one. `e2e/health-profile.spec.ts` SPAM-001 is
 * what catches it.
 *
 * Which path a request took is not the honest test, though. The question is
 * whether it changed anything clinical, and an identical resubmission has
 * not: that caller's intent is already satisfied, so it should write nothing
 * at all -- no record update, no history entry. That is the same reasoning
 * the credit ledger's idempotency keys follow: key the decision on the thing
 * that happened, never on who got there first.
 *
 * Deliberately compares only what a reader of the record would call a
 * change. `updated_at`, `last_submitted_by` and `last_submitted_role` are
 * bookkeeping and are identical on a double-tap anyway, so including them
 * would make every comparison differ and defeat the check.
 */
export function isSameIntakeSubmission(
  current: {
    specialty: ConditionSpecialty;
    status: string;
    data: Record<string, string>;
    triageData: Record<string, string>;
  },
  incoming: {
    specialty: ConditionSpecialty;
    data: Record<string, string>;
    triageData: Record<string, string>;
  }
): boolean {
  // Anything other than a live record is a change worth making: a draft
  // becoming active is exactly what onboarding does.
  if (current.status !== "active") return false;
  if (current.specialty !== incoming.specialty) return false;
  return (
    sameStringMap(current.data, incoming.data) &&
    sameStringMap(current.triageData, incoming.triageData)
  );
}

/** Key-by-key equality over a flat string map. `data` and `triage_data` are
 *  both flat by design (see the globally-unique-keys rule), so there is no
 *  nesting to recurse into and JSON.stringify's key ordering cannot bite. */
function sameStringMap(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if ((a[k] ?? "") !== (b[k] ?? "")) return false;
  return true;
}
