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

/** One sentence. Why the practice exists at all. */
export const MISSION =
  "To give anyone in pain an hour with a physiotherapist who watches how they actually move — wherever they live, and whatever they can afford to travel.";

/** One sentence. What the world looks like if we succeed. */
export const VISION =
  "A recovery plan should not depend on being near a good clinic. We are building the practice that proves distance was never the clinical problem.";

export type MissionPrinciple = {
  key: string;
  /** A few words. */
  title: string;
  /** Two sentences at most: the promise, and how it is kept. */
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
    body: "No plan is written before someone has watched you move for an hour. Generic exercise sheets are what we exist to replace.",
    icon: "fa-magnifying-glass",
  },
  {
    key: "continuity",
    title: "One therapist, all the way",
    body: "Buy a course of sessions and the first physiotherapist assigned to it keeps you for the rest. Continuity is clinical, not a nicety.",
    icon: "fa-user-check",
  },
  {
    key: "plain",
    title: "Say it plainly",
    body: "You leave every session knowing what is wrong, what you are doing about it, and what should change by next time. Nothing is left in jargon.",
    icon: "fa-comments",
  },
  {
    key: "record",
    title: "Your record is yours",
    body: "Everything in your chart exports as a PDF you can hand to any clinician. Your uploaded scans are stored privately, and you can delete them.",
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
    body: "If your case needs hands-on care or a referral we do not provide, the assessment ends by saying so.",
    icon: "fa-hand",
  },
  {
    key: "no-lock-in",
    title: "No subscriptions, no auto-renewals",
    body: "You buy a session or a course of them. Cancel more than 24 hours ahead and the payment is refunded in full.",
    icon: "fa-lock-open",
  },
  {
    key: "no-upsell",
    title: "No selling from the treatment table",
    body: "Your physiotherapist proposes the next session; you decide whether to book it. Declining changes nothing about your care.",
    icon: "fa-ban",
  },
];
