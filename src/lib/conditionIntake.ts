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
    inputType: "textarea",
    required: true,
  },
  {
    key: "since_when",
    label: "How long has this been going on?",
    inputType: "text",
    required: true,
  },
  {
    key: "severity",
    label: "Overall severity right now (0 = none, 10 = worst pain you can imagine)",
    inputType: "scale_0_10",
    required: true,
  },
  {
    key: "area_pain",
    label: "Where does it hurt? Tap each area, then rate the pain there from 0 (no pain) to 10 (worst pain you can imagine).",
    inputType: "area_pain_list",
    required: false,
  },
  { key: "worsens", label: "What makes it worse?", inputType: "text", required: false },
  { key: "helps", label: "What helps or relieves it?", inputType: "text", required: false },
  {
    key: "notes",
    label: "Anything else the therapist should know?",
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
