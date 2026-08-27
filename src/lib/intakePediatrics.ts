import type { IntakeQuestion } from "@/lib/conditionIntake";

// The paediatric Patient Care Intake.
//
// Addressed to the caregiver throughout ("your child"), never to the
// patient: the person answering is a parent or guardian, and wording that
// forgets this reads as written by someone who has not met a paediatric
// patient. The measure is milestones, not pain -- `peds_milestones` is
// this set's trended figure, the paediatric answer to the ortho pain
// gauge, and the summary card and snapshot strip both read it as such.
// There is deliberately no pain scale and no `area_pain` body map.
//
// Every key is prefixed `peds_` for the flat-namespace reason documented
// in intakeNeuro.ts and asserted in conditionIntake.ts.
//
// The caregiver's identity is provenance, not a clinical question, so it
// does not spend one of the seven slots: `peds_caregiver_name` and
// `peds_caregiver_relationship` are ordinary flat keys carried in
// CAREGIVER_QUESTIONS below, rendered as one "Who is answering?" step
// ahead of question 1 and excluded from the seven-question count. Storing
// them as ordinary keys means the wizard renders them, the required check
// enforces them on client and server, the admin can reword them in Manage
// Questions and the PDF prints them -- all for free. Dedicated columns
// would need a branch in six places for the same two strings.
export const PEDS_CAREGIVER_KEYS = ["peds_caregiver_name", "peds_caregiver_relationship"] as const;

export const PEDS_CAREGIVER_QUESTIONS: IntakeQuestion[] = [
  {
    key: "peds_caregiver_name",
    label: "Your name",
    shortLabel: "Answered by",
    helpText:
      "We record who spoke for the child so that anyone reading these notes later knows whose account this is.",
    placeholder: "e.g. Priya Sharma",
    inputType: "text",
    required: true,
  },
  {
    key: "peds_caregiver_relationship",
    label: "How are you related to the child?",
    shortLabel: "Relationship",
    placeholder: "e.g. Mother",
    inputType: "text",
    required: true,
  },
];

export const PEDS_INTAKE_QUESTIONS: IntakeQuestion[] = [
  {
    key: "peds_concern",
    label: "What is the main concern about your child?",
    shortLabel: "Main concern",
    helpText:
      "In your own words. “He isn’t walking yet at twenty months” or “she drags her right leg” tells us more than a medical term would.",
    placeholder: "e.g. Not sitting without support at 11 months",
    inputType: "textarea",
    required: true,
  },
  {
    key: "peds_birth_history",
    label: "How was your child born?",
    shortLabel: "Birth history",
    helpText:
      "Prematurity and a difficult birth are the commonest reasons a child needs physiotherapy, so this is the first thing we look at. “Not sure” is a perfectly good answer.",
    inputType: "select",
    options: [
      "Full term, normal delivery",
      "Full term, caesarean",
      "Premature (before 37 weeks)",
      "Needed NICU or oxygen support after birth",
      "Not sure",
    ],
    required: true,
  },
  {
    key: "peds_milestones",
    label: "Which of these can your child do on their own today?",
    shortLabel: "Milestones",
    helpText:
      "Tick everything your child can do without help, even if it is wobbly. Milestones are how progress is measured in children — this is the line we will watch move.",
    inputType: "multi_select",
    options: [
      "Holds head steady",
      "Rolls over",
      "Sits without support",
      "Crawls",
      "Pulls to stand",
      "Walks a few steps",
      "Walks steadily",
      "Runs",
      "Climbs stairs",
      "Speaks in words",
      "Feeds themselves",
    ],
    required: true,
  },
  {
    key: "peds_diagnosis",
    label: "Has a doctor given a diagnosis, or ordered any tests?",
    shortLabel: "Diagnosis",
    helpText:
      "For example cerebral palsy, Down syndrome, torticollis, club foot — or a delay with no name yet. If nothing has been said, leave it blank; it does not change whether we can help.",
    placeholder: "e.g. Left torticollis, diagnosed at 3 months",
    inputType: "text",
    required: false,
  },
  {
    key: "peds_equipment",
    label: "Does your child use a brace, splint, walker, wheelchair or special footwear?",
    shortLabel: "Equipment",
    helpText:
      "Anything they wear or use to get about, and roughly when they got it. Children outgrow these quickly, and a brace that no longer fits works against the exercises.",
    placeholder: "e.g. Ankle splints on both legs, fitted last year",
    inputType: "text",
    required: false,
  },
  {
    key: "peds_daily_difficulty",
    label: "What is hardest for your child in a normal day?",
    shortLabel: "Hardest day-to-day",
    helpText:
      "Feeding, sleeping, sitting through school, playing with other children, getting dressed. This is what treatment is actually trying to change.",
    placeholder: "e.g. Tires quickly and cannot keep up with other children at play",
    inputType: "textarea",
    required: false,
  },
  {
    key: "peds_goal",
    label: "What would you most like your child to be able to do in the next few months?",
    shortLabel: "Your goal",
    helpText:
      "One thing, however small: sit alone through a meal, walk into the classroom, hold a spoon. It keeps the programme honest and gives us something to celebrate.",
    placeholder: "e.g. Walk into the classroom on her own",
    inputType: "textarea",
    required: false,
  },
];
