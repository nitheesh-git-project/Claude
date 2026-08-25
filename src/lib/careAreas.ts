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
    photoAlt: "A patient stretching on a mat at home with her laptop propped in front of her",
    icon: "fa-bone",
  },
  {
    key: "neck",
    title: "Neck & shoulder",
    blurb: "Stiffness, headaches and pain that starts at your desk.",
    photo: "care-neck",
    photoAlt: "A woman taking a guided shoulder stretch at her desk, laptop open beside her",
    icon: "fa-head-side-cough",
  },
  {
    key: "knee",
    title: "Knee & joint pain",
    blurb: "Arthritis, ligament injuries and post-surgery recovery.",
    photo: "care-knee",
    photoAlt: "An older man doing a guided leg exercise on a mat, following his laptop",
    icon: "fa-person-walking",
  },
  {
    key: "posture",
    title: "Posture & desk setup",
    blurb: "We look at how you sit, then fix the chair and the body.",
    photo: "care-posture",
    photoAlt: "A woman at her home desk, laptop open, easing her neck after hours of sitting",
    icon: "fa-chair",
  },
  {
    key: "sports",
    title: "Sports injury",
    blurb: "Getting runners and gym-goers back to full load safely.",
    photo: "care-sports",
    photoAlt: "Two people mid-workout at home, following the session on a laptop",
    icon: "fa-person-running",
  },
  {
    key: "mobility",
    title: "Mobility & neuro care",
    blurb: "Balance, walking and Parkinson's rehabilitation at home.",
    photo: "care-mobility",
    photoAlt: "An older man in a video consultation with his physiotherapist on a tablet",
    icon: "fa-hands-holding-child",
  },
];
