// Patient Care Intake: the general (non-region) history/severity form
// behind patient_condition_profiles / condition_change_requests (see
// supabase/schema.sql). This module's question set is a placeholder — the
// full question list is a separate design pass, not yet done. Shipping
// this short generic set keeps the submit → admin-review → live workflow
// fully functional now; swapping in the real questions later only touches
// INTAKE_QUESTIONS below, not the request/approval/gating code around it.
export type IntakeQuestion = {
  key: string;
  label: string;
  inputType: "text" | "textarea" | "scale_0_10";
};

// Bump this whenever INTAKE_QUESTIONS' wording or field set changes.
// Stamped onto patient_condition_profiles.schema_version whenever a
// submission is approved (or admin edits directly), so a later wording
// change doesn't silently misrepresent what an already-approved answer was
// actually responding to — see that column's comment in schema.sql.
export const INTAKE_QUESTIONS_VERSION = 1;

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  { key: "chief_complaint", label: "What's the main issue you'd like help with?", inputType: "textarea" },
  { key: "since_when", label: "How long has this been going on?", inputType: "text" },
  {
    key: "severity",
    label: "Overall severity right now (0 = none, 10 = worst imaginable)",
    inputType: "scale_0_10",
  },
  { key: "worsens", label: "What makes it worse?", inputType: "text" },
  { key: "helps", label: "What helps or relieves it?", inputType: "text" },
  { key: "notes", label: "Anything else the therapist should know?", inputType: "textarea" },
];

export type ConditionProfileStatus = "not_started" | "draft" | "pending_review" | "active";

export const CONDITION_STATUS_LABEL: Record<ConditionProfileStatus, string> = {
  not_started: "Not started",
  draft: "Draft — not submitted",
  pending_review: "Pending admin review",
  active: "Complete",
};
