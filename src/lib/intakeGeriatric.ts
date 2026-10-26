import type { IntakeQuestion } from "@/lib/conditionIntake";

// The geriatric Patient Care Intake -- "Strength and balance care" to the
// patient (Health Profile redesign, phase 6a).
//
// The aim of this care is fewer falls and staying independent at home, so
// the record leads with the CDC STEADI screen: three questions (a fall in
// the last year, feeling unsteady, worrying about falling), any "yes" to
// which means the four STEADI tests are done. Those three answers feed
// `steadiScreen()` / `steadiLevel()` in geriatricRisk.ts; the falls answer
// distinguishes one fall WITH an injury because, in STEADI's 2017
// algorithm, that (or two or more falls) puts a person in the high group
// whatever the tests show. Daily living is the Katz six (bathing,
// dressing, toileting, bed to chair, continence, feeding) as a "which do
// you need help with" list, so `katzFromIntake()` can count it.
//
// There is no pain scale and no body map, for the reason intakeNeuro.ts
// gives: they say nothing about falls or independence.
//
// Every key is prefixed `geri_` for the flat-namespace rule asserted in
// conditionIntake.ts.
//
// The carer is a pre-step, the paediatric caregiver pattern -- but
// OPTIONAL, because the patient usually speaks for themselves and a carer
// is often absent. `geri_carer_name` / `geri_carer_relationship` are
// ordinary flat keys, excluded from the seven-question count (provenance,
// not a clinical question), and feed the profile header's optional carer
// line ("Her son, Ramesh, joins the home visits").

/** The answers whose wording the risk rules read. Exported so the rules and
 *  the questions cannot drift apart (geriatricRisk.test.ts checks every one
 *  is an option of its question). */
export const GERI_FALLS_NONE = "No falls";
export const GERI_FALLS_ONE = "One fall, without an injury";
export const GERI_FALLS_ONE_INJURED = "One fall, with an injury";
export const GERI_FALLS_TWO_PLUS = "Two or more falls";
export const GERI_YES = "Yes";
export const GERI_NO = "No";

/** The Katz six as the patient reads them, in the order of the Katz index
 *  (and of the registry's `katz_adl` score sheet). */
export const GERI_KATZ_ACTIVITIES = [
  "Bathing or washing",
  "Getting dressed",
  "Using the toilet",
  "Getting from bed to a chair",
  "Bladder and bowel control",
  "Eating",
] as const;
export const GERI_DAILY_HELP_NONE = "None - I manage all of these on my own";

export const GERI_CARER_KEYS = ["geri_carer_name", "geri_carer_relationship"] as const;

export const GERI_CARER_QUESTIONS: IntakeQuestion[] = [
  {
    key: "geri_carer_name",
    label: "Does a family member or carer help you, or join your visits? Their name",
    shortLabel: "Carer",
    helpText:
      "Only if someone helps - a son, a daughter, a carer. We note who, so your physiotherapist knows who to talk to about exercises at home. Leave it blank if it's just you.",
    placeholder: "e.g. Ramesh",
    inputType: "text",
    required: false,
    excludeFromCount: true,
  },
  {
    key: "geri_carer_relationship",
    label: "How are they related to you?",
    shortLabel: "Carer is your",
    placeholder: "e.g. Son",
    inputType: "text",
    required: false,
    excludeFromCount: true,
  },
];

export const GERI_INTAKE_QUESTIONS: IntakeQuestion[] = [
  {
    key: "geri_concern",
    label: "What worries you most about getting about at the moment?",
    shortLabel: "Main concern",
    helpText:
      "In your own words. “I fell in the bathroom twice” or “my legs feel weak on the stairs” tells us more than a medical term would.",
    placeholder: "e.g. I've fallen three times this year and I'm nervous on the stairs",
    inputType: "textarea",
    required: true,
  },
  {
    key: "geri_falls_12m",
    label: "Have you fallen in the last 12 months?",
    shortLabel: "Falls this year",
    helpText:
      "Any time you ended up on the floor or the ground without meaning to, even if you weren't hurt. Whether a fall injured you matters too - it changes how carefully we start.",
    inputType: "select",
    options: [GERI_FALLS_NONE, GERI_FALLS_ONE, GERI_FALLS_ONE_INJURED, GERI_FALLS_TWO_PLUS],
    required: true,
  },
  {
    key: "geri_unsteady",
    label: "Do you feel unsteady when you stand up or walk?",
    shortLabel: "Feels unsteady",
    helpText: "Even now and then - getting out of a chair, turning round, or walking outside.",
    inputType: "select",
    options: [GERI_YES, GERI_NO],
    required: true,
  },
  {
    key: "geri_fall_worry",
    label: "Do you worry about falling?",
    shortLabel: "Worried about falling",
    helpText:
      "Many people stop going out because of this worry, which makes the legs weaker. Saying yes helps us plan exercises that build your confidence as well.",
    inputType: "select",
    options: [GERI_YES, GERI_NO],
    required: true,
  },
  {
    key: "geri_walking_aid",
    label: "What do you use to help you walk?",
    shortLabel: "Walking aid",
    helpText:
      "We test you with the aid you normally use, so every test is done the same way and the results can be compared.",
    inputType: "select",
    options: [
      "Nothing",
      "A walking stick",
      "A walking frame or rollator",
      "Someone's arm",
      "A wheelchair for longer distances",
      "Something else",
    ],
    required: false,
  },
  {
    key: "geri_daily_help",
    label: "Which of these do you need help with?",
    shortLabel: "Needs help with",
    helpText:
      "Tick anything someone else has to help you with, even a little. It shows what to work on so you can do more on your own.",
    inputType: "multi_select",
    options: [...GERI_KATZ_ACTIVITIES, GERI_DAILY_HELP_NONE],
    exclusiveOptions: [GERI_DAILY_HELP_NONE],
    required: false,
  },
  {
    key: "geri_goal",
    label: "What would you most like to be able to do again?",
    shortLabel: "Your goal",
    helpText:
      "One thing that matters to you: walk to the temple, visit a neighbour, manage the stairs at home. It keeps the plan honest and gives us something to aim for together.",
    placeholder: "e.g. Walk to my daughter's house on the next street, on my own",
    inputType: "textarea",
    required: false,
  },
];
