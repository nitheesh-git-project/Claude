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

/**
 * One line, under fifteen words. Why the practice exists at all.
 *
 * Two things in here were wrong before and should not come back. It opened
 * with "An hour", which is a number the product does not guarantee -- session
 * length is `session_duration_minutes` per package and `duration_minutes` per
 * category, both admin-set, so a fixed figure in the one line a visitor reads
 * as a promise is the same mistake `ClosingCta`'s assurance lines exist to
 * avoid. And it ended "wherever you live", which reads as somebody travelling
 * to you: consultations here are video, and a home visit is the exception for
 * a patient for whom video will not do, gated by `home_visit_areas`.
 * "Wherever you are" is true of both modes and implies neither.
 *
 * The outcome is worded as the return to normal life rather than the absence
 * of pain. "Painless", "fully recovered" and the like are outcome guarantees
 * no physiotherapist can make, and they would contradict `COMMITMENTS` a
 * band below on the same page, where the clinic says it will tell you when
 * this is not for you.
 */
export const MISSION =
  "Wherever you are, a qualified physiotherapist gets you moving like you did before.";

/** One line, under fifteen words. What it looks like if we succeed. */
export const VISION =
  "Recovery should never depend on living near a good clinic.";

/**
 * Bounds on the two lines an admin may write in their place.
 *
 * Generous next to the fifteen-word rule above rather than equal to it: the
 * budget is editorial advice the screen gives, and a character cap is a
 * layout guard. Both lines render as a single display-face paragraph in a
 * card on the home page and as the mission page's hero sentence, so the real
 * failure a limit prevents is a paragraph pasted into a slot built for a
 * sentence. Mirrored by the columns' own CHECK constraints and re-checked in
 * `/api/admin/update-setting`, which stays the authority.
 */
export const MAX_MISSION_LENGTH = 160;
export const MAX_VISION_LENGTH = 140;

/** The two lines as they render, whatever the database does or does not hold. */
export type MissionCopy = { mission: string; vision: string };

/**
 * The stored override, or the line above when there is no override.
 *
 * Blank is a value here rather than an error, the same way
 * `splash_brand_line` blank means "follow the site name": it is how an admin
 * undoes an edit without having to retype the original out of a code file
 * they cannot read. So the constants above stay the reviewed default and the
 * setting is an override on top of them, which also means a database that has
 * never run the migration renders exactly what it rendered before.
 *
 * Kept pure and in this module -- rather than inside the read below, or in
 * the page -- because it is the half with a rule in it, and a rule about what
 * a visitor reads on the home page is worth a unit test rather than a click.
 */
export function resolveMissionCopy(
  row: { mission_statement?: string | null; vision_statement?: string | null } | null | undefined
): MissionCopy {
  const stored = (value: string | null | undefined, fallback: string) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed.length > 0 ? trimmed : fallback;
  };
  return {
    mission: stored(row?.mission_statement, MISSION),
    vision: stored(row?.vision_statement, VISION),
  };
}

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
