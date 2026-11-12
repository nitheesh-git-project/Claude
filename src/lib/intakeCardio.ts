import type { IntakeQuestion } from "@/lib/conditionIntake";

// The cardiopulmonary Patient Care Intake -- "Heart and lung
// rehabilitation" to the patient (Health Profile redesign, phase 6a).
//
// After heart surgery, a heart attack, or with a lung condition such as
// COPD, progress is how far and how comfortably the person can exercise --
// safely. So this set records what every exercise session's safety check
// reads (cardioSafety.ts):
//  - the condition, which decides the default oxygen stop limit (88% for a
//    lung condition, 90% for a heart one) when the doctor has set none;
//  - a beta-blocker, which keeps the heart rate low whatever the effort, so
//    Karvonen heart-rate targets are refused and effort is judged by the
//    talk test instead;
//  - after open-heart surgery, the surgeon's breastbone precautions and the
//    date they end;
//  - breathlessness in daily life as the mMRC grade (free), in plain words;
//  - home oxygen and what is prescribed;
//  - the doctor's oxygen stop limit, a select so the answer is always a
//    number the safety check can use (the paediatric weeks-at-birth rule).
//
// Seven questions are always asked. Three are follow-ups (`showWhen`, the
// Parkinson's precedent): the precautions and their end date only after
// open-heart surgery -- a COPD patient is never asked about a breastbone --
// and the prescription only when home oxygen is "Yes". A hidden follow-up
// is never unanswered, never required and never counted.
//
// No licensed scale is asked here: the modified Borg, the Borg 6-20 and the
// CAT stay in the registry, switched off (outcomeMeasures.ts).
//
// Every key is prefixed `cardio_` for the flat-namespace rule asserted in
// conditionIntake.ts.

export const CARDIO_CONDITION_OPEN_HEART = "Heart bypass or valve surgery (open-heart)";
export const CARDIO_CONDITION_HEART_ATTACK = "Heart attack";
export const CARDIO_CONDITION_STENT = "A stent or angioplasty";
export const CARDIO_CONDITION_HEART_FAILURE = "Heart failure";
export const CARDIO_CONDITION_COPD = "COPD (long-term lung disease)";
export const CARDIO_CONDITION_OTHER_LUNG = "Asthma or another lung condition";
export const CARDIO_CONDITION_OTHER = "Another heart or lung condition";

export const CARDIO_CONDITION_OPTIONS = [
  CARDIO_CONDITION_OPEN_HEART,
  CARDIO_CONDITION_HEART_ATTACK,
  CARDIO_CONDITION_STENT,
  CARDIO_CONDITION_HEART_FAILURE,
  CARDIO_CONDITION_COPD,
  CARDIO_CONDITION_OTHER_LUNG,
  CARDIO_CONDITION_OTHER,
] as const;

/** The conditions whose default stop limit is the lung one (88%). Every
 *  other answer -- and none -- takes the heart one (90%), the more cautious
 *  of the two. */
export const CARDIO_LUNG_CONDITIONS: readonly string[] = [CARDIO_CONDITION_COPD, CARDIO_CONDITION_OTHER_LUNG];

export const CARDIO_BETA_BLOCKER_YES = "Yes";
export const CARDIO_BETA_BLOCKER_NO = "No";
export const CARDIO_BETA_BLOCKER_NOT_SURE = "Not sure";

/** The mMRC grades 0-4 in plain words, index = grade. The wording is the
 *  patient's; the grade is what the clinician reads (`mmrcGradeFromIntake`
 *  in cardioSafety.ts). Admins may reword the question, never the options,
 *  so the index is stable. */
export const CARDIO_MMRC_OPTIONS = [
  "Only with hard exercise",
  "When I hurry, or walk up a slight hill",
  "I walk slower than others my age, or stop for breath at my own pace",
  "I stop for breath after about 100 metres, or a few minutes on the flat",
  "Too breathless to leave the house, or when dressing",
] as const;

export const CARDIO_HOME_OXYGEN_YES = "Yes";
export const CARDIO_HOME_OXYGEN_NO = "No";

/** "No limit given" means the default applies, said so on the profile. */
export const CARDIO_SPO2_LIMIT_NONE = "No limit given, or not sure";
export const CARDIO_SPO2_LIMIT_OPTIONS = [
  CARDIO_SPO2_LIMIT_NONE,
  "85%",
  "86%",
  "87%",
  "88%",
  "89%",
  "90%",
  "91%",
  "92%",
  "93%",
  "94%",
] as const;

export const CARDIO_INTAKE_QUESTIONS: IntakeQuestion[] = [
  {
    key: "cardio_condition",
    label: "What is the main reason for your heart or lung rehabilitation?",
    shortLabel: "Condition",
    helpText:
      "Pick the closest one. It changes how we start, what we check before every session, and the oxygen level we keep you above.",
    inputType: "select",
    options: [...CARDIO_CONDITION_OPTIONS],
    required: true,
  },
  {
    key: "cardio_condition_date",
    label: "When was the surgery or heart attack, or when were you diagnosed?",
    shortLabel: "When",
    helpText:
      "A month and year is plenty. How long ago it was decides which stage of recovery you are in, and what is safe to start with.",
    placeholder: "e.g. July 2026",
    inputType: "text",
    required: false,
  },
  {
    key: "cardio_sternal_precautions",
    label: "What did your surgeon say you must not do yet?",
    shortLabel: "Surgeon's precautions",
    helpText:
      "After open-heart surgery the breastbone needs time to heal. Tell us the rules you were given - for example how much you may lift, or not pushing up from a chair with your arms.",
    placeholder: "e.g. No lifting over 4 kg, no pushing up with the arms",
    inputType: "textarea",
    required: false,
    showWhen: { key: "cardio_condition", equals: CARDIO_CONDITION_OPEN_HEART },
  },
  {
    key: "cardio_sternal_precautions_until",
    label: "Until when do those rules apply?",
    shortLabel: "Precautions until",
    helpText:
      "The date your surgeon gave. Until then every exercise keeps to the rules; after it we check with the surgeon before lifting them.",
    placeholder: "e.g. 20 Sep 2026",
    inputType: "text",
    required: false,
    showWhen: { key: "cardio_condition", equals: CARDIO_CONDITION_OPEN_HEART },
  },
  {
    key: "cardio_beta_blocker",
    label: "Do you take a beta-blocker?",
    shortLabel: "Beta-blocker",
    helpText:
      "A heart medicine whose name often ends in “-olol”, such as metoprolol or bisoprolol. It keeps your heart rate low however hard you work, so we judge effort another way. “Not sure” is fine - bring your medicine list.",
    inputType: "select",
    options: [CARDIO_BETA_BLOCKER_YES, CARDIO_BETA_BLOCKER_NO, CARDIO_BETA_BLOCKER_NOT_SURE],
    required: true,
  },
  {
    key: "cardio_breathlessness",
    label: "These days, when do you get breathless?",
    shortLabel: "Breathless when",
    helpText:
      "Pick the one closest to an ordinary day. We ask again every few weeks - moving up this list is one of the clearest signs rehabilitation is working.",
    inputType: "select",
    options: [...CARDIO_MMRC_OPTIONS],
    required: true,
  },
  {
    key: "cardio_home_oxygen",
    label: "Do you use oxygen at home?",
    shortLabel: "Home oxygen",
    inputType: "select",
    options: [CARDIO_HOME_OXYGEN_NO, CARDIO_HOME_OXYGEN_YES],
    required: true,
  },
  {
    key: "cardio_oxygen_prescription",
    label: "How much oxygen, and when do you use it?",
    shortLabel: "Oxygen prescribed",
    helpText: "As it is written on your prescription, if you have it to hand. We keep to the same during exercise.",
    placeholder: "e.g. 2 litres a minute when walking and at night",
    inputType: "text",
    required: false,
    showWhen: { key: "cardio_home_oxygen", equals: CARDIO_HOME_OXYGEN_YES },
  },
  {
    key: "cardio_spo2_limit",
    label: "Has your doctor told you an oxygen level you should not go below?",
    shortLabel: "Oxygen stop limit",
    helpText:
      "The number on a finger oxygen meter that means stop and rest. If no one has said, we use 88% for a lung condition and 90% for a heart condition until your doctor tells us otherwise.",
    inputType: "select",
    options: [...CARDIO_SPO2_LIMIT_OPTIONS],
    required: false,
  },
  {
    key: "cardio_goal",
    label: "What would you most like to be able to do again?",
    shortLabel: "Your goal",
    helpText:
      "One thing that matters to you: go back to work, walk with family on a Sunday, climb the stairs at home without stopping. It keeps the programme honest.",
    placeholder: "e.g. Back at work, and walking 5 km with my wife on Sunday mornings",
    inputType: "textarea",
    required: false,
  },
];
