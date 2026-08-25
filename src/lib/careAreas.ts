import type { PhotoId } from "@/lib/marketingPhotos";

/**
 * What we treat, in the words a patient would use to describe it.
 *
 * Shared by the home page's "What we treat" grid and /conditions, so the two
 * cannot drift into describing different practices. Titles are the complaint
 * ("Back pain"), not the discipline ("Lumbar rehabilitation"): a visitor
 * searches for what hurts.
 *
 * These are the standing areas of practice. The *sellable* programmes and
 * packages are admin-controlled rows out of `treatment_categories` and
 * render separately — this grid is breadth, that catalog is what you can buy
 * today, and conflating the two is what made the old page read as one very
 * long list of things.
 */
export type CareArea = {
  key: string;
  title: string;
  /** One line, under twelve words. */
  blurb: string;
  photo: PhotoId;
  /**
   * Describes the photograph, not the condition — the blurb below already
   * says what the card is about, and a screen reader announcing the blurb
   * twice tells someone nothing about the image they cannot see.
   */
  photoAlt: string;
  icon: string;
};

export const CARE_AREAS: CareArea[] = [
  {
    key: "back",
    title: "Back pain",
    blurb: "Lower-back and disc pain, loaded back up step by step.",
    photo: "care-back",
    photoAlt: "A patient resting on her mat between exercises, smiling at her laptop",
    icon: "fa-bone",
  },
  {
    key: "neck",
    title: "Neck & shoulder",
    blurb: "Stiffness, headaches and pain that starts at your desk.",
    photo: "care-neck",
    photoAlt: "A patient smiling through a side stretch at home, laptop in front of her",
    icon: "fa-head-side-cough",
  },
  {
    key: "knee",
    title: "Knee & joint pain",
    blurb: "Arthritis, ligament injuries and post-surgery recovery.",
    photo: "care-knee",
    photoAlt: "A patient working with light dumbbells on her mat, laptop open beside her",
    icon: "fa-person-walking",
  },
  {
    key: "posture",
    title: "Posture & desk setup",
    blurb: "We look at how you sit, then fix the chair and the body.",
    photo: "care-posture",
    photoAlt: "A patient stretching out her arms at her desk, laptop open in front of her",
    icon: "fa-chair",
  },
  {
    key: "sports",
    title: "Sports injury",
    blurb: "Getting runners and gym-goers back to full load safely.",
    photo: "care-sports",
    photoAlt: "Two patients mid-workout at home, following the session on a laptop",
    icon: "fa-person-running",
  },
  {
    key: "mobility",
    title: "Mobility & neuro care",
    blurb: "Balance, walking and Parkinson's rehabilitation at home.",
    photo: "care-mobility",
    photoAlt: "An older couple smiling through a video consultation on their tablet",
    icon: "fa-hands-holding-child",
  },
];
