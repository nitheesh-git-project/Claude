// The public "Your health profile" showcase on /how-it-works, and its teaser
// band on the home page. It shows the Health Profile of every condition type
// the clinic offers with SAMPLE data -- never a real patient's -- drawn
// through the same components a patient's own dashboard uses, so the
// showcase cannot drift from the product. What each profile shows is in
// the sample records (healthProfileSamples.ts), shaped by the product's own
// view functions; this module holds the words around them.
//
// Which profiles appear follows `site_settings.enabled_intake_specialties`:
// a condition type the clinic has not switched on is not advertised. The
// orthopaedic profile always appears (it is the default type and cannot be
// switched off), the neurological and paediatric ones with their switch, and
// Strength and balance care and Heart and lung rehabilitation only once an
// admin has turned them on -- they are off until then. Parkinson's is part
// of neurological care, shown inside that tab, not a condition type of its
// own. Dependency-free apart from the condition vocabulary.
//
// The wording says what a profile SHOWS. It never says what treatment will
// achieve: the sample patients are invented and their figures are made up.

import { specialtyPatientLabel, specialtyDef, type ConditionSpecialty } from "@/lib/conditionSpecialty";

/** Every condition type has a sample. */
export type ShowcaseSpecialty = ConditionSpecialty;

export type ShowcaseProfile = {
  specialty: ShowcaseSpecialty;
  /** The patient's name for the care (never "geriatric" or "triage"). */
  label: string;
  icon: string;
  /** Who it is for, in one plain line. */
  forWho: string;
  /** What the profile watches, in three plain lines naming the measures. */
  watches: [string, string, string];
  /** The headline change the sample shows. */
  headline: { metric: string; from: string; to: string };
  /** What the picture under the headline is. */
  picture: string;
  /** The invented patient the sample draws: the first name (the unit test
   *  holds it to the sample record) and a line about them. */
  sample: { name: string; line: string };
};

const PROFILES: Omit<ShowcaseProfile, "label" | "icon">[] = [
  {
    specialty: "ortho",
    sample: { name: "Riya", line: "a sore right knee and lower back" },
    forWho: "Joints, muscles and the back: a sore knee, a stiff shoulder, recovery after surgery.",
    watches: [
      "Pain in each sore area, scored 0 to 10 on a body map",
      "How far the knee bends, in degrees, and how fully it straightens",
      "Leg strength compared with the other side",
    ],
    headline: { metric: "Pain score", from: "7/10", to: "3/10" },
    picture: "Body map and knee bend",
  },
  {
    specialty: "neuro",
    sample: { name: "Arun", line: "recovery after a stroke, with a Parkinson's example" },
    forWho: "Stroke, Parkinson's, MS and nerve injuries: how the body is working, and how it changes.",
    watches: [
      "How much help you need to walk, from 0 to 5, and walking speed",
      "Balance, and the time to stand up, walk and sit back down",
      "Falls, and day-to-day independence",
    ],
    headline: { metric: "How much help to walk", from: "2 of 5", to: "4 of 5" },
    picture: "Walking ladder and examination",
  },
  {
    specialty: "pediatrics",
    sample: { name: "Meera", line: "born early, slower to stand and walk" },
    forWho: "Babies and children whose movement is developing more slowly. A parent or carer tells us.",
    watches: [
      "Six movement milestones, against the ages when most children reach them",
      "Age corrected for prematurity, where it applies",
      "Time standing alone and first steps, timed at each visit",
    ],
    headline: { metric: "Milestones reached", from: "1 of 6", to: "4 of 6" },
    picture: "Milestone windows by age",
  },
  {
    specialty: "geriatric",
    sample: { name: "Lakshmi", line: "three falls this year, arthritis in both knees" },
    forWho: "Later life: falls, feeling unsteady, getting weaker, staying independent at home.",
    watches: [
      "Falls in the last 12 months, and the fall-risk level they give",
      "Four short tests: balance, chair stands, walking speed and Up and Go",
      "Daily living, and whether the home has been made safer",
    ],
    headline: { metric: "Tests in the safer range", from: "0 of 4", to: "3 of 4" },
    picture: "Fall-risk dial and the four tests",
  },
  {
    specialty: "cardiopulmonary",
    sample: { name: "Dinesh", line: "recovering after heart bypass surgery" },
    forWho: "After heart surgery or a heart attack, or with a lung condition such as COPD.",
    watches: [
      "The six-minute walk, in metres",
      "Oxygen against your own limit, heart rate and breathlessness",
      "Active minutes each week, from your diary",
    ],
    headline: { metric: "Six-minute walk", from: "285 m", to: "372 m" },
    picture: "Six-minute walk and oxygen",
  },
];

export const SHOWCASE_PROFILES: ShowcaseProfile[] = PROFILES.map((p) => ({
  ...p,
  label: specialtyPatientLabel(p.specialty),
  icon: specialtyDef(p.specialty).icon,
}));

/** Only the profiles the clinic offers, in a fixed order. Orthopaedic always
 *  appears: it is the default condition type and no setting removes it, so
 *  the showcase is never empty. Every other type needs its switch on
 *  (`enabled_intake_specialties`); the two newest are off until an admin
 *  turns them on. */
export function enabledShowcaseProfiles(enabled: readonly ConditionSpecialty[]): ShowcaseProfile[] {
  return SHOWCASE_PROFILES.filter((p) => p.specialty === "ortho" || enabled.includes(p.specialty));
}

/** What every sample says about itself, beside every profile. */
export const SAMPLE_NOTE = "Sample patient - figures are made up";

/** The course, from the first form to the record you keep. */
export const PROGRESS_STEPS: { icon: string; title: string; body: string }[] = [
  { icon: "fa-clipboard-list", title: "Health profile", body: "Questions for your kind of care, answered before you meet." },
  { icon: "fa-bullseye", title: "Goal and milestones", body: "Your physiotherapist examines you, then plans the steps with you." },
  { icon: "fa-notes-medical", title: "After each session", body: "Fresh scores and a short summary, added to your graph." },
  { icon: "fa-chart-line", title: "Reviews", body: "Today set beside your first visit, each milestone marked." },
  { icon: "fa-file-pdf", title: "Your record", body: "The whole chart, as a PDF you keep." },
];
