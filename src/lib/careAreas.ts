import type { PhotoId } from "@/lib/marketingPhotos";

/**
 * What we treat, in the words a patient would use to describe it.
 *
 * Shared by the home page's "What we treat" band and /conditions, so the two
 * cannot drift into describing different practices. Titles are the complaint
 * ("Back pain"), not the discipline ("Lumbar rehabilitation"): a visitor
 * searches for what hurts.
 *
 * These are the standing areas of practice. The *sellable* programmes and
 * packages are admin-controlled rows out of `treatment_categories` and
 * render separately — this band is breadth, that catalog is what you can buy
 * today, and conflating the two is what made the old page read as one very
 * long list of things.
 *
 * Each area carries more than a card's worth of copy on purpose. They are
 * shown one at a time by `CareAreaShowcase`, so there is room for the answer
 * a visitor actually wants — what we look at, and what happens next — rather
 * than the six-word blurb a grid of six cards could fit.
 */
export type CareArea = {
  key: string;
  title: string;
  /** One line, under twelve words — the summary in the picker. */
  blurb: string;
  /** Two sentences at most: what this actually involves. */
  detail: string;
  /** Three short lines. What the therapist looks at in the first session. */
  checks: string[];
  photo: PhotoId;
  /**
   * Describes the photograph, not the condition — the blurb already says what
   * the area is, and a screen reader announcing it twice tells someone
   * nothing about the image they cannot see.
   */
  photoAlt: string;
  icon: string;
};

export const CARE_AREAS: CareArea[] = [
  {
    key: "back",
    title: "Back pain",
    blurb: "Lower-back and disc pain, loaded back up step by step.",
    detail:
      "The most common reason patients reach us. We find what your back can tolerate today, then rebuild that tolerance week by week instead of resting it away.",
    checks: [
      "How far you can bend, and where it catches",
      "Which positions ease it and which provoke it",
      "The sitting and lifting habits keeping it there",
    ],
    photo: "care-back",
    photoAlt: "A patient resting on her mat between exercises, smiling at her laptop",
    icon: "fa-bone",
  },
  {
    key: "neck",
    title: "Neck & shoulder",
    blurb: "Stiffness, headaches and pain that starts at your desk.",
    detail:
      "Neck pain that turns into headaches usually starts somewhere else — the shoulder blade, the mid-back, or the way your screen sits. We treat the cause, not the sore spot.",
    checks: [
      "Neck rotation and side-bend, both directions",
      "Shoulder blade control under load",
      "Where your screen and keyboard actually sit",
    ],
    photo: "care-neck",
    photoAlt: "A patient smiling through a side stretch at home, laptop in front of her",
    icon: "fa-user-injured",
  },
  {
    key: "knee",
    title: "Knee & joint pain",
    blurb: "Arthritis, ligament injuries and post-surgery recovery.",
    detail:
      "Whether it is arthritis, a ligament injury or the weeks after surgery, the work is the same shape: restore the range, then load the joint until it trusts you again.",
    checks: [
      "Range of motion against your other side",
      "Strength through the range, not just at the end",
      "How you walk, and what you are avoiding",
    ],
    photo: "care-knee",
    photoAlt: "A patient working with light dumbbells on her mat, laptop open beside her",
    icon: "fa-person-walking",
  },
  {
    key: "posture",
    title: "Posture & desk setup",
    blurb: "We look at how you sit, then fix the chair and the body.",
    detail:
      "Being on video is the advantage here: your therapist sees the actual desk causing the problem, not a description of it, and fixes the setup in the same session as the body.",
    checks: [
      "Your real chair, screen and desk height",
      "How long you hold each position",
      "The two or three changes worth making first",
    ],
    photo: "care-posture",
    photoAlt: "A patient stretching out her arms at her desk, laptop open in front of her",
    icon: "fa-chair",
  },
  {
    key: "sports",
    title: "Sports injury",
    blurb: "Getting runners and gym-goers back to full load safely.",
    detail:
      "Rest alone does not return you to sport — graded load does. We set the milestones your injury has to clear and progress you through them rather than guessing at a date.",
    checks: [
      "What the injured tissue tolerates right now",
      "The gap between that and your sport's demand",
      "A week-by-week plan to close it",
    ],
    photo: "care-sports",
    photoAlt: "Two patients mid-workout at home, following the session on a laptop",
    icon: "fa-person-running",
  },
  {
    key: "mobility",
    title: "Mobility & neuro care",
    blurb: "Balance, walking and Parkinson's rehabilitation at home.",
    detail:
      "Gait, balance and cueing-based movement work, delivered as a home programme. Carers are welcome in the session, since they are the ones who see it every day.",
    checks: [
      "Balance and walking, in your own rooms",
      "The trip hazards a clinic visit never sees",
      "A routine a carer can help run",
    ],
    photo: "care-mobility",
    photoAlt: "An older couple smiling through a video consultation on their tablet",
    icon: "fa-hands-holding-child",
  },
];
