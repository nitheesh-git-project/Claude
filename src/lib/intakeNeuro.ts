import type { IntakeQuestion } from "@/lib/conditionIntake";
import { NEURO_SUBTYPE_KEY, NEURO_SUBTYPE_PARKINSONS } from "@/lib/profileKind";

// The neurological Patient Care Intake.
//
// The measure here is function and independence, not pain. There is
// deliberately no 0-10 pain scale and no `area_pain` body map: asking a
// stroke patient to rate their pain and tap where it hurts produces a
// record that says nothing about their recovery. `neuro_independence` is
// this set's trended figure -- the neurological answer to the ortho pain
// gauge -- and the summary card and snapshot strip both read it as such.
//
// Every key is prefixed `neuro_` because patient_condition_profiles.data
// stays flat across all three sets: re-triaging a patient keeps the
// previous specialty's answers in the same blob, which only works while
// the key namespaces are disjoint. conditionIntake.ts asserts that.
//
// Known gap, flagged rather than smuggled in: there is no medication /
// other-conditions question. Epilepsy, anticoagulants, diabetes and blood
// pressure all change what is safe in a session, and today they live only
// in session notes, which the patient cannot see. The set is capped at
// seven by product decision; this is the first candidate if that is ever
// relaxed.
//
// Schema version 2 (Health Profile redesign, phase 4a) adds the condition
// group (`neuro_subtype`) and, behind it, the Parkinson's follow-ups. The
// owner's decision: Parkinson's is a SUB-PROFILE inside neurological care,
// not a condition type -- `profileKindFor()` reads this answer to give the
// record the `neuro_parkinsons` thresholds, tests and milestones. The
// follow-ups carry `showWhen` and are asked only when the group reads
// Parkinson's, so the seven above stay what every other neurological
// patient answers (eight with the group). The group itself is optional:
// required, it would make every existing neurological record incomplete
// overnight, refuse an unrelated edit to one, and raise the "we've changed
// some of these questions" banner for all of them -- and an unanswered
// group is honestly "neurological", which is what those records are.

/** The condition groups `neuro_subtype` offers. Parkinson's is the one that
 *  changes the profile kind today; the others are recorded for the
 *  clinician and become sub-profiles one at a time, if ever. */
export const NEURO_SUBTYPE_OPTIONS = [
  "Stroke or brain injury",
  "Spinal cord injury",
  NEURO_SUBTYPE_PARKINSONS,
  "Multiple sclerosis",
  "Nerve injury or neuropathy",
  "Other or not sure",
] as const;

const WHEN_PARKINSONS = { key: NEURO_SUBTYPE_KEY, equals: NEURO_SUBTYPE_PARKINSONS };

/** The questions asked only of a Parkinson's patient, in the order the
 *  wizard asks them (straight after the condition group). */
export const NEURO_PARKINSONS_QUESTIONS: IntakeQuestion[] = [
  {
    key: "neuro_pd_year_diagnosed",
    label: "Roughly when were you diagnosed with Parkinson's?",
    shortLabel: "Diagnosed",
    helpText:
      "A year is plenty. How long someone has lived with Parkinson's changes what we expect each exercise to do, and what we keep an eye on.",
    placeholder: "e.g. 2019",
    inputType: "text",
    required: true,
    showWhen: WHEN_PARKINSONS,
  },
  {
    key: "neuro_pd_medication_times",
    label: "When do you usually take your Parkinson's medicine?",
    shortLabel: "Medicine times",
    helpText:
      "Your usual times, the way you would tell a friend. The medicine changes how easily you move through the day, so we plan sessions around it - and only compare tests done at the same point after a dose.",
    placeholder: "e.g. 7 am, 1 pm and 7 pm - or \"not taking any yet\"",
    inputType: "textarea",
    required: false,
    showWhen: WHEN_PARKINSONS,
  },
  {
    key: "neuro_pd_freezing",
    label: "How often do your feet feel stuck to the floor when you try to walk?",
    shortLabel: "Feet getting stuck",
    helpText:
      "This is called freezing. It often happens in doorways, when turning round, or when starting to walk. It is one of the main reasons people with Parkinson's fall, so it shapes the plan.",
    inputType: "select",
    options: ["Never", "Less than once a week", "Most weeks", "Most days", "Several times a day", "Not sure"],
    required: true,
    showWhen: WHEN_PARKINSONS,
  },
  {
    key: "neuro_pd_falls_worry",
    label: "How worried are you about falling?",
    shortLabel: "Worry about falling",
    helpText:
      "Worry about falling can make people move less, and moving less makes a fall more likely. Knowing how you feel helps us build confidence as well as strength.",
    inputType: "select",
    options: ["Not at all", "A little", "Quite a lot", "Very worried"],
    required: false,
    showWhen: WHEN_PARKINSONS,
  },
  {
    key: "neuro_pd_main_difficulty",
    label: "What is hardest for you day to day right now?",
    shortLabel: "Hardest thing",
    helpText:
      "Pick the one that gets in the way most. We start where it matters to you, and come back to the rest.",
    inputType: "select",
    options: [
      "Starting to walk, or turning round",
      "Getting up from a chair or out of bed",
      "Keeping my balance",
      "Small hand movements - buttons, writing",
      "Speaking or swallowing",
      "Tiredness",
      "Something else - I'll tell my physiotherapist",
    ],
    required: false,
    showWhen: WHEN_PARKINSONS,
  },
];

export const NEURO_INTAKE_QUESTIONS: IntakeQuestion[] = [
  {
    key: "neuro_diagnosis",
    label: "What is the neurological condition or event, and when did it start?",
    shortLabel: "Condition & onset",
    helpText:
      "The date matters as much as the diagnosis. Recovery in the first three months after a stroke works very differently from recovery two years on, and the plan is built around which of those this is.",
    placeholder: "e.g. Stroke affecting the right side, March 2026",
    inputType: "textarea",
    required: true,
  },
  {
    key: NEURO_SUBTYPE_KEY,
    label: "Which of these best describes the condition?",
    shortLabel: "Condition group",
    helpText:
      "Different neurological conditions change in different ways, so this decides which tests and goals make sense for you. If you are not sure, choose the last one - your physiotherapist will help.",
    inputType: "select",
    options: [...NEURO_SUBTYPE_OPTIONS],
    required: false,
  },
  ...NEURO_PARKINSONS_QUESTIONS,
  {
    key: "neuro_affected_side",
    label: "Which part of the body is affected?",
    shortLabel: "Affected side",
    helpText:
      "Where the weakness or loss of control shows up. This decides which side we train and which side we protect.",
    inputType: "select",
    options: [
      "Left side",
      "Right side",
      "Both sides",
      "Legs only",
      "Arms only",
      "Whole body",
      "Not sure",
    ],
    required: true,
  },
  {
    key: "neuro_mobility",
    label: "How do you move around indoors right now?",
    shortLabel: "How you move",
    helpText:
      "The single most useful thing we can know before we start. It sets where treatment begins, and it is the first thing we expect to change.",
    inputType: "select",
    options: [
      "Walk unaided",
      "Walk with a stick or frame",
      "Walk holding on to someone",
      "Use a wheelchair",
      "Mostly in bed",
    ],
    required: true,
  },
  {
    key: "neuro_independence",
    label: "Day-to-day independence right now (0 = need help with everything, 10 = fully independent)",
    shortLabel: "Independence",
    helpText:
      "Dressing, bathing, eating, getting to the toilet. Your therapist re-asks this over time - it is the neurological equivalent of a pain score, and it is how we will show you that things are moving.",
    inputType: "scale_0_10",
    required: true,
  },
  {
    key: "neuro_symptoms",
    label: "Which of these are present?",
    shortLabel: "Symptoms",
    helpText:
      "Tick everything that applies, even mildly. Neurological problems show up in clusters, and the cluster tells us which pathway is affected.",
    inputType: "multi_select",
    options: [
      "Weakness",
      "Stiffness or spasticity",
      "Tremor",
      "Numbness or altered sensation",
      "Poor balance",
      "Difficulty speaking",
      "Difficulty swallowing",
      "Bladder or bowel changes",
      "Fatigue",
      "Dizziness",
    ],
    required: false,
  },
  {
    key: "neuro_falls",
    label: "Falls in the last three months?",
    shortLabel: "Falls",
    helpText:
      "Falls are the main risk we are trying to remove, so this shapes the plan more than almost anything else here. Near-misses count - mention those to your therapist too.",
    inputType: "select",
    options: ["None", "One", "Two or three", "More than three", "Not applicable - cannot stand"],
    required: false,
  },
  {
    key: "neuro_goal",
    label: "What would you most like to be able to do again?",
    shortLabel: "Main goal",
    helpText:
      "One concrete thing: walk to the gate, hold a cup, climb the stairs at home, get back to work. Neurological rehabilitation is planned backwards from a goal, so this shapes the whole programme.",
    placeholder: "e.g. Walk to the end of the street without holding on",
    inputType: "textarea",
    required: false,
  },
];
