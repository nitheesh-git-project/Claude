import type { PhotoId } from "@/lib/marketingPhotos";

/**
 * "What treatment works towards": for each kind of care, where a sample
 * patient started and the goal their physiotherapist worked towards.
 *
 * These are goals, never promises. Every figure is a made-up sample patient
 * (the same people the health-profile showcase draws, plus Priya for desk and
 * posture care), labelled as one on screen, with "results vary" beside it.
 * The headline figures agree with `healthProfileShowcase.ts` where the two
 * share a patient; the unit test holds them together.
 *
 * Dependency-free so the words and numbers are tested without rendering.
 */
export type TreatmentGoal = {
  key: "ortho" | "desk" | "neuro" | "paeds" | "balance" | "heart";
  label: string;
  /** The tab's name: short enough that all six sit on one row. */
  short: string;
  metric: string;
  from: number;
  to: number;
  max: number;
  /** How the figure is written: "7/10", "2 of 5", "285 m". */
  format: "of-10" | "x-of-n" | "metres";
  /** Three short lines about the first visit. */
  before: [string, string, string];
  /** Three short lines about the goal. */
  after: [string, string, string];
  /** The goal in the patient's own words. */
  goal: string;
  sample: string;
  photo: PhotoId;
  /** Where the crop centres on a narrow screen, as a CSS object-position. */
  focus: string;
  photoAlt: string;
};

export const TREATMENT_GOALS: TreatmentGoal[] = [
  {
    key: "ortho",
    label: "Orthopaedic care",
    short: "Orthopaedic",
    metric: "Pain score",
    from: 7,
    to: 3,
    max: 10,
    format: "of-10",
    before: ["Stairs hurt", "Knee stiff every morning", "Short walks only"],
    after: ["Stairs one after the other", "Knee bends further each week", "Walks for half an hour"],
    goal: "Climb the stairs without wincing",
    sample: "Sample patient Riya, a sore right knee",
    photo: "goal-ortho",
    focus: "45% 60%",
    photoAlt: "A physiotherapist strapping the knee of a seated patient",
  },
  {
    key: "desk",
    label: "Desk and posture care",
    short: "Desk & posture",
    metric: "Neck and back pain",
    from: 6,
    to: 2,
    max: 10,
    format: "of-10",
    before: ["Stiff neck by lunchtime", "Headaches after long calls", "Back aches by evening"],
    after: ["Through the workday without the ache", "Desk and screen set up right", "Two-minute stretch breaks"],
    goal: "Work a full day without the ache",
    sample: "Sample patient Priya, eight hours a day at a desk",
    photo: "goal-desk",
    focus: "35% 40%",
    photoAlt: "A woman taking a stretch break at her office desk",
  },
  {
    key: "neuro",
    label: "Neurological care",
    short: "Neurological",
    metric: "Help needed to walk",
    from: 2,
    to: 4,
    max: 5,
    format: "x-of-n",
    before: ["Needs an arm to walk", "Unsteady on turns", "Help to get dressed"],
    after: ["Walks with a stick", "Turns without a wobble", "Dresses on his own"],
    goal: "Walk to the door with just a stick",
    sample: "Sample patient Arun, after a stroke",
    photo: "goal-neuro",
    focus: "32% 35%",
    photoAlt: "A physiotherapist guiding an older man through an arm exercise",
  },
  {
    key: "paeds",
    label: "Paediatric physiotherapy",
    short: "Children",
    metric: "Milestones reached",
    from: 1,
    to: 4,
    max: 6,
    format: "x-of-n",
    before: ["Sits with support", "Not yet pulling up", "Unsure on their feet"],
    after: ["Sits unaided", "Pulls up to stand", "First steps, holding on"],
    goal: "Reach the next movement milestones",
    sample: "Sample patient Meera, born early",
    photo: "goal-paeds",
    focus: "35% 45%",
    photoAlt: "A smiling mother steadying her laughing toddler as he walks",
  },
  {
    key: "balance",
    label: "Strength and balance care",
    short: "Strength & balance",
    metric: "Tests in the safer range",
    from: 0,
    to: 3,
    max: 4,
    format: "x-of-n",
    before: ["Three falls this year", "Holds on to furniture", "Avoids going out"],
    after: ["Steadier on her feet", "Up from a chair unaided", "Out to the market again"],
    goal: "Feel steady at home and outside",
    sample: "Sample patient Lakshmi, three falls this year",
    photo: "goal-balance",
    focus: "58% 40%",
    photoAlt: "A grandmother and her granddaughter holding a balance pose at home",
  },
  {
    key: "heart",
    label: "Heart and lung rehabilitation",
    short: "Heart & lung",
    metric: "Six-minute walk",
    from: 285,
    to: 372,
    max: 450,
    format: "metres",
    before: ["Breathless on the stairs", "Rests every few minutes", "Nervous to push"],
    after: ["Climbs a flight steadily", "Walks most days", "Knows a safe heart rate"],
    goal: "Walk further, breathe easier",
    sample: "Sample patient Dinesh, after bypass surgery",
    photo: "goal-heart",
    focus: "62% 45%",
    photoAlt: "A senior man exercising with light weights in a park",
  },
];

/** The figure written the way the band prints it. */
export function formatGoalValue(goal: Pick<TreatmentGoal, "format" | "max">, value: number): string {
  const v = Math.round(value);
  if (goal.format === "of-10") return `${v}/10`;
  if (goal.format === "metres") return `${v} m`;
  return `${v} of ${goal.max}`;
}

/** What every story says about itself. */
export const TREATMENT_GOALS_NOTE = "Typical goals; results vary with every person.";
