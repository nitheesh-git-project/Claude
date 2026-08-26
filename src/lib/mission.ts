/**
 * What the practice is for, in its own words.
 *
 * Kept as data rather than markup for the same reason `careAreas.ts` is: the
 * mission band and the "what we will not do" band are the two places on the
 * site where the wording will be argued over, and they should be editable
 * without touching a layout.
 *
 * The register here is deliberately plainer than a mission statement usually
 * gets. A patient in pain reading "empowering journeys towards holistic
 * wellness" learns nothing; the test each line has to pass is whether it
 * makes a claim that could be checked.
 */

/** One line, under fifteen words. Why the practice exists at all. */
export const MISSION =
  "An hour with a physiotherapist who watches how you actually move — wherever you live.";

/** One line, under fifteen words. What it looks like if we succeed. */
export const VISION =
  "Recovery should never depend on living near a good clinic.";

export type MissionPrinciple = {
  key: string;
  /** A few words. */
  title: string;
  /** One line, under ten words. The promise, nothing else. */
  body: string;
  icon: string;
};

/**
 * How the mission shows up in the product. Each of these is a decision
 * already made in the codebase, not an aspiration — the refund window, the
 * therapist lock, the export, the private bucket all exist. Anything added
 * here has to be similarly checkable.
 */
export const PRINCIPLES: MissionPrinciple[] = [
  {
    key: "assess",
    title: "Assess before advising",
    body: "No plan is written before someone has watched you move.",
    icon: "fa-magnifying-glass",
  },
  {
    key: "continuity",
    title: "One therapist, all the way",
    body: "The same physiotherapist for every session in your course.",
    icon: "fa-user-check",
  },
  {
    key: "plain",
    title: "Say it plainly",
    body: "You leave knowing what is wrong and what to do.",
    icon: "fa-comments",
  },
  {
    key: "record",
    title: "Your record is yours",
    body: "Your whole chart exports as a PDF you keep.",
    icon: "fa-file-shield",
  },
];

/**
 * The limits, stated on the page rather than buried in the FAQ.
 *
 * A clinic that names what it will not do is more believable than one that
 * claims everything, and every line here is a rule the platform enforces —
 * so this band doubles as the honest version of the pricing and refund copy.
 */
export const COMMITMENTS: MissionPrinciple[] = [
  {
    key: "not-for-you",
    title: "We will tell you if this is not for you",
    body: "If you need hands-on care, the assessment says so.",
    icon: "fa-hand",
  },
  {
    key: "no-lock-in",
    title: "No subscriptions, no auto-renewals",
    body: "Cancel 24 hours ahead for a full refund. No subscriptions.",
    icon: "fa-lock-open",
  },
  {
    key: "no-upsell",
    title: "No selling from the treatment table",
    body: "You decide the next session. Declining changes nothing.",
    icon: "fa-ban",
  },
];
