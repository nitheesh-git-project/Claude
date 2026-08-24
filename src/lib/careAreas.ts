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
  icon: string;
};

export const CARE_AREAS: CareArea[] = [
  {
    key: "back",
    title: "Back pain",
    blurb: "Lower-back and disc pain, loaded back up step by step.",
    photo: "care-back",
    icon: "fa-bone",
  },
  {
    key: "neck",
    title: "Neck & shoulder",
    blurb: "Stiffness, headaches and pain that starts at your desk.",
    photo: "care-neck",
    icon: "fa-head-side-cough",
  },
  {
    key: "knee",
    title: "Knee & joint pain",
    blurb: "Arthritis, ligament injuries and post-surgery recovery.",
    photo: "care-knee",
    icon: "fa-person-walking",
  },
  {
    key: "posture",
    title: "Posture & desk setup",
    blurb: "We look at how you sit, then fix the chair and the body.",
    photo: "care-posture",
    icon: "fa-chair",
  },
  {
    key: "sports",
    title: "Sports injury",
    blurb: "Getting runners and gym-goers back to full load safely.",
    photo: "care-sports",
    icon: "fa-person-running",
  },
  {
    key: "mobility",
    title: "Mobility & neuro care",
    blurb: "Balance, walking and Parkinson's rehabilitation at home.",
    photo: "care-mobility",
    icon: "fa-hands-holding-child",
  },
];
