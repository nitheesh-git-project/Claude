import type { IntakeQuestion } from "@/lib/conditionIntake";

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
      "Dressing, bathing, eating, getting to the toilet. Your therapist re-asks this over time — it is the neurological equivalent of a pain score, and it is how we will show you that things are moving.",
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
      "Falls are the main risk we are trying to remove, so this shapes the plan more than almost anything else here. Near-misses count — mention those to your therapist too.",
    inputType: "select",
    options: ["None", "One", "Two or three", "More than three", "Not applicable — cannot stand"],
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
