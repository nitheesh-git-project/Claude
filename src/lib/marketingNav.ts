import type { PhotoId } from "@/lib/marketingPhotos";

/**
 * The public site's seven pages, defined once.
 *
 * This is the marketing-side counterpart of `adminNav.ts`: the home page's
 * "Explore" connectors, the navbar's link list and each page's own "where to
 * go next" footer all read this array, so a page cannot exist in the header
 * but be missing from the home page's index, and a renamed page cannot leave
 * a stale description behind on another page.
 *
 * `blurb` is deliberately capped at one short line. The redesign exists
 * because visitors could not tell what the site was: the fix is that every
 * link states its own purpose in the words a patient would use, and states
 * only that. If a blurb needs a second sentence, the page behind it is doing
 * two jobs and should be split.
 */
export type MarketingPageKey =
  | "home"
  | "conditions"
  | "how-it-works"
  | "home-visit"
  | "team"
  | "mission"
  | "faq"
  | "hospitals";

export type MarketingPage = {
  key: MarketingPageKey;
  href: string;
  /** Short label for the header nav and the connector card. */
  label: string;
  /** One line, patient's words, no jargon. */
  blurb: string;
  icon: string;
  photo: PhotoId;
  /**
   * Describes the photograph, not the page — the blurb already says what the
   * page is for, and a screen reader announcing it twice tells someone
   * nothing about the image they cannot see.
   */
  photoAlt: string;
  /** Verb-first text for the card's own link. */
  action: string;
  /**
   * Home visits sit behind an admin master switch and the page 404s while it
   * is off, so every surface that lists pages has to be able to drop this one
   * rather than link into a dead end.
   */
  requiresHomeVisit?: boolean;
};

export const MARKETING_PAGES: MarketingPage[] = [
  {
    key: "home",
    href: "/",
    label: "Home",
    blurb: "What we do, and the two ways to start.",
    icon: "fa-house",
    photo: "hero-therapy",
    photoAlt: "A patient smiling as she works through her exercises at home, laptop open in front of her",
    action: "Start here",
  },
  {
    key: "conditions",
    href: "/conditions",
    label: "Conditions",
    blurb: "What we treat, and the programme for each.",
    icon: "fa-bone",
    photo: "hero-conditions",
    photoAlt: "A patient holding a balance exercise on her mat, laptop open beside her",
    action: "See conditions",
  },
  {
    key: "how-it-works",
    href: "/how-it-works",
    label: "How it works",
    blurb: "Booking to recovery, in four steps.",
    icon: "fa-route",
    photo: "hero-how-it-works",
    photoAlt: "A physiotherapist smiling at his desk, ready to start a video session",
    action: "See the steps",
  },
  {
    key: "home-visit",
    href: "/home-visit",
    label: "Home visit",
    blurb: "A physiotherapist at your door.",
    icon: "fa-house-medical",
    photo: "hero-home-visit",
    photoAlt: "A physiotherapist guiding an older patient through an arm exercise in their living room",
    action: "Check my area",
    requiresHomeVisit: true,
  },
  {
    key: "team",
    href: "/team",
    label: "Our team",
    blurb: "The specialist who will actually treat you.",
    icon: "fa-user-doctor",
    photo: "hero-team",
    photoAlt: "A physiotherapist smiling mid-consultation, her tablet set up for the call",
    action: "Meet the team",
  },
  {
    key: "mission",
    href: "/mission",
    label: "Our mission",
    blurb: "Why we exist, and what we promise.",
    icon: "fa-bullseye",
    photo: "hero-mission",
    photoAlt: "Two patients following their exercise plan together at home, laptop open in front of them",
    action: "Read our mission",
  },
  {
    key: "faq",
    href: "/faq",
    label: "FAQ",
    blurb: "Cost, refunds, privacy.",
    icon: "fa-circle-question",
    photo: "hero-faq",
    photoAlt: "A physiotherapist at her laptop, answering a patient's questions on a call",
    action: "Read answers",
  },
  {
    key: "hospitals",
    href: "/hospitals",
    label: "For hospitals",
    blurb: "Refer a patient, get their progress back.",
    icon: "fa-hospital",
    photo: "hero-hospitals",
    photoAlt: "A clinician following up with a discharged patient over a video consultation",
    action: "Partner with us",
  },
];

const BY_KEY = new Map(MARKETING_PAGES.map((page) => [page.key, page]));

export function marketingPage(key: MarketingPageKey): MarketingPage {
  const page = BY_KEY.get(key);
  // Unreachable while MarketingPageKey and MARKETING_PAGES stay in step --
  // thrown rather than returned as undefined so adding a key without an
  // entry fails loudly in a build instead of rendering a blank card.
  if (!page) throw new Error(`Unknown marketing page: ${key}`);
  return page;
}

/**
 * The pages to offer from a given page — every page except the one being
 * read, with Home Visit dropped when the clinic has switched it off.
 *
 * Used by the home page's connector grid and by the "Explore the site" strip
 * at the foot of the other six, which is why it takes the current page rather
 * than assuming home: linking a page to itself is a dead click.
 */
export function otherMarketingPages(
  current: MarketingPageKey,
  homeVisitEnabled: boolean
): MarketingPage[] {
  return MARKETING_PAGES.filter(
    (page) =>
      page.key !== current && (homeVisitEnabled || !page.requiresHomeVisit)
  );
}

/**
 * What the home page's connector grid shows: the other six pages plus
 * booking, so the index of the site always ends on the one action the site
 * exists for rather than trailing off into another page to read.
 */
export type MarketingConnector = Omit<MarketingPage, "key"> & { key: string };

export const BOOK_CONNECTOR: MarketingConnector = {
  key: "book",
  href: "/book",
  label: "Book a session",
  blurb: "Pick a time. Meet your therapist.",
  icon: "fa-calendar-check",
  photo: "step-book",
  photoAlt: "A patient smiling as she books her session on her phone",
  action: "Book now",
};

/**
 * What an Explore band shows on any public page: every other page, then
 * booking.
 *
 * Booking used to be on the home page's grid alone, so the six inner pages
 * ended their index on another page to read. Wherever a visitor stops
 * reading, the next step has to be in the same place -- that is the rule the
 * shared ClosingCta exists for, and the index above it was the one band
 * still answering "what now?" with "here is more to look at".
 *
 * `homeConnectors` is this function for the home page; both go through here
 * so the two bands cannot end differently.
 */
export function exploreConnectors(
  current: MarketingPageKey,
  homeVisitEnabled: boolean
): MarketingConnector[] {
  return [...otherMarketingPages(current, homeVisitEnabled), BOOK_CONNECTOR];
}

export function homeConnectors(homeVisitEnabled: boolean): MarketingConnector[] {
  return exploreConnectors("home", homeVisitEnabled);
}
