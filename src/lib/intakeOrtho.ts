import type { IntakeQuestion } from "@/lib/conditionIntake";

// The orthopaedic Patient Care Intake -- the original seven questions,
// moved here verbatim when the intake became specialty-aware. Wording,
// help text, placeholders and required-ness are unchanged, deliberately:
// every profile that existed before specialties is stamped 'ortho', and
// these answers already ARE this set.
//
// This is the only set that keeps the Pain Map layer: the body map, the
// self-vs-clinical comparison view and the pain trend line all hang off
// `area_pain` and `severity`, and both are ortho-only concepts.

export const ORTHO_INTAKE_QUESTIONS: IntakeQuestion[] = [
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
