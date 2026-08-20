import type { PainMapRegionKey, PainMapSide } from "@/lib/painMap";

// Patient Care Intake: the general (non-region) history/severity form
// behind patient_condition_profiles / condition_change_requests (see
// supabase/schema.sql). Question wording and which questions are
// mandatory can both be overridden per-question by admin
// (intake_question_templates, see mergeIntakeQuestionOverrides below) --
// the array here is the code default, not the last word.
export type IntakeQuestion = {
  key: string;
  label: string;
  inputType: "text" | "textarea" | "scale_0_10" | "area_pain_list";
  required: boolean;
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

// Bump this whenever INTAKE_QUESTIONS' field set changes (adding/removing
// a question) -- not for a pure wording tweak, since that's already
// covered by the admin-editable override living outside this file.
// Stamped onto patient_condition_profiles.schema_version whenever a
// submission is approved (or admin edits directly), so a later field-set
// change doesn't silently misrepresent what an already-approved answer
// was actually responding to -- see that column's comment in schema.sql.
export const INTAKE_QUESTIONS_VERSION = 2;

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  {
    key: "chief_complaint",
    label: "What's the main issue you'd like help with?",
    shortLabel: "Main issue",
    helpText:
      "Describe the one problem that made you book, in your own words. No medical terms needed — \"my lower back hurts when I stand up\" is exactly right.",
    placeholder: "e.g. Lower back pain that started after lifting a suitcase",
    inputType: "textarea",
    required: true,
  },
  {
    key: "since_when",
    label: "How long has this been going on?",
    shortLabel: "How long",
    helpText:
      "A rough answer is fine. How long a problem has lasted changes the treatment plan — a week-old injury is treated differently from a two-year-old ache.",
    placeholder: "e.g. About 3 weeks",
    inputType: "text",
    required: true,
  },
  {
    key: "severity",
    label: "Overall severity right now (0 = none, 10 = worst pain you can imagine)",
    shortLabel: "Severity today",
    helpText:
      "Just how you feel today, as one number. Your therapist re-asks this over time, so it becomes the measure of whether treatment is working.",
    inputType: "scale_0_10",
    required: true,
  },
  {
    key: "area_pain",
    label: "Where does it hurt? Tap each area, then rate the pain there from 0 (no pain) to 10 (worst pain you can imagine).",
    shortLabel: "Painful areas",
    helpText:
      "Tap every spot that hurts on the figure — you can pick more than one. Pain often shows up away from its cause, so marking all of it helps your therapist find the source.",
    inputType: "area_pain_list",
    required: false,
  },
  {
    key: "worsens",
    label: "What makes it worse?",
    shortLabel: "Makes it worse",
    helpText:
      "Movements, positions or times of day that set it off — sitting, climbing stairs, first thing in the morning. These are the clues that point to a cause.",
    placeholder: "e.g. Sitting for more than 20 minutes, bending forward",
    inputType: "text",
    required: false,
  },
  {
    key: "helps",
    label: "What helps or relieves it?",
    shortLabel: "What helps",
    helpText:
      "Anything that eases it — rest, heat, ice, a stretch, medication. What already works usually becomes part of your plan.",
    placeholder: "e.g. Lying flat, a hot water bag",
    inputType: "text",
    required: false,
  },
  {
    key: "notes",
    label: "Anything else the therapist should know?",
    shortLabel: "Other notes",
    helpText:
      "Past surgeries or injuries, ongoing conditions, medication, pregnancy, or anything that worries you. Leave it blank if nothing comes to mind.",
    placeholder: "e.g. Knee surgery in 2019, diabetic",
    inputType: "textarea",
    required: false,
  },
];

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

export type IntakeQuestionOverrideRow = {
  question_key: string;
  question_text: string;
  required: boolean;
};

/** Applies admin-edited wording/required-ness from intake_question_templates
 *  on top of the code defaults -- same merge shape as painMap.ts's
 *  mergeQuestionOverrides, but also carries `required` since that's
 *  admin-editable here too (Pain Map has no per-question required concept). */
export function mergeIntakeQuestionOverrides(
  defaults: IntakeQuestion[],
  overrides: IntakeQuestionOverrideRow[]
): IntakeQuestion[] {
  const overrideByKey = new Map(overrides.map((o) => [o.question_key, o]));
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
  return !!value && !!value.trim();
}

export function countAnswered(questions: IntakeQuestion[], answers: Record<string, string>): number {
  return questions.filter((q) => isAnswered(q, answers)).length;
}
