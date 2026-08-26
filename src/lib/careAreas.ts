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
  /** Under eight words — the summary in the picker. */
  blurb: string;
  /** One sentence, under fifteen words: what this actually involves. */
  detail: string;
  /** Three lines, five words each. What the first session looks at. */
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
    blurb: "Lower-back and disc pain.",
    detail: "We find what your back tolerates today, then rebuild it week by week.",
    checks: [
      "How far you bend",
      "What eases it",
      "How you sit and lift",
    ],
    photo: "care-back",
    photoAlt: "A patient resting on her mat between exercises, smiling at her laptop",
    icon: "fa-bone",
  },
  {
    key: "neck",
    title: "Neck & shoulder",
    blurb: "Stiffness and headaches that start at your desk.",
    detail: "Neck pain usually starts somewhere else. We treat the cause, not the sore spot.",
    checks: [
      "Rotation, both directions",
      "Shoulder blade control",
      "Where your screen sits",
    ],
    photo: "care-neck",
    photoAlt: "A patient smiling through a side stretch at home, laptop in front of her",
    icon: "fa-user-injured",
  },
  {
    key: "knee",
    title: "Knee & joint pain",
    blurb: "Arthritis, ligaments, recovery after surgery.",
    detail: "Restore the range, then load the joint until it trusts you again.",
    checks: [
      "Range against your other side",
      "Strength through the range",
      "How you walk",
    ],
    photo: "care-knee",
    photoAlt: "A patient working with light dumbbells on her mat, laptop open beside her",
    icon: "fa-person-walking",
  },
  {
    key: "posture",
    title: "Posture & desk setup",
    blurb: "How you sit, and what it is costing you.",
    detail: "Your physiotherapist sees the actual desk causing it, and fixes both.",
    checks: [
      "Your real chair and screen",
      "How long you hold it",
      "The two changes worth making",
    ],
    photo: "care-posture",
    photoAlt: "A patient stretching out her arms at her desk, laptop open in front of her",
    icon: "fa-chair",
  },
  {
    key: "sports",
    title: "Sports injury",
    blurb: "Back to full load, safely.",
    detail: "Rest alone does not return you to sport. Graded load does.",
    checks: [
      "What the injury tolerates",
      "What your sport demands",
      "A week-by-week plan",
    ],
    photo: "care-sports",
    photoAlt: "Two patients mid-workout at home, following the session on a laptop",
    icon: "fa-person-running",
  },
  {
    key: "mobility",
    title: "Mobility & neuro care",
    blurb: "Balance, walking and Parkinson's care at home.",
    detail: "Gait and balance work in your own rooms, with your carer welcome.",
    checks: [
      "Balance where you walk",
      "Trip hazards a clinic misses",
      "A routine a carer can run",
    ],
    photo: "care-mobility",
    photoAlt: "An older couple smiling through a video consultation on their tablet",
    icon: "fa-hands-holding-child",
  },
];
