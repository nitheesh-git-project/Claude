// Whether the public site may present home visits as something a visitor can
// book, and what to say when it may not.
//
// The master switch alone is not enough. A clinic can switch Home Visit on
// before it has a single service area or a single price, and every public
// surface then advertised a mode whose first step ("check my pincode") could
// only answer no -- a dead end with a button on it. The nav item, the home
// page's "Option two" band and the /home-visit call to action now show as
// bookable only when all three hold: the switch is on, at least one area is
// active, and at least one condition has a price. Anything short of that is
// said honestly ("Home visits are coming to Chennai") with no button to
// nowhere.
//
// This module only judges; the reads are in homeVisitFlag.ts. Dependency-free
// so the judgement is unit-tested rather than clicked.

export type HomeVisitOfferState =
  /** Switch on, an area is served and something is priced: bookable. */
  | "live"
  /** Switch on, but no area or no price yet: announce, do not sell. */
  | "coming"
  /** Switch off (or never configured): the mode does not exist publicly. */
  | "off";

export type HomeVisitAreaRow = { city?: string | null; area_name?: string | null };

export type HomeVisitOffer = {
  state: HomeVisitOfferState;
  /** Cities with an active area, alphabetical, de-duplicated. */
  cities: string[];
  /** Named areas within them, alphabetical, de-duplicated. */
  areaNames: string[];
};

export const NO_HOME_VISIT_OFFER: HomeVisitOffer = { state: "off", cities: [], areaNames: [] };

function clean(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.map((v) => v?.trim()).filter((v): v is string => Boolean(v)))].sort(
    (a, b) => a.localeCompare(b)
  );
}

/**
 * Judges the three conditions.
 *
 * `areas` and `hasPrice` are `null` when their read failed. That is "we could
 * not check", not "there are none": a transient failure must not take a
 * working service off the site (the booking page and every route behind it
 * re-check the same facts themselves), so an unreadable fact counts as met.
 * The switch is the opposite: an unreadable switch fails closed, as it
 * always has, and is passed in as `false` by the caller.
 */
export function resolveHomeVisitOffer(input: {
  enabled: boolean;
  areas: HomeVisitAreaRow[] | null;
  hasPrice: boolean | null;
}): HomeVisitOffer {
  const cities = clean((input.areas ?? []).map((a) => a.city));
  const areaNames = clean((input.areas ?? []).map((a) => a.area_name));
  if (!input.enabled) return { state: "off", cities, areaNames };
  const noArea = input.areas !== null && (input.areas.length === 0 || cities.length === 0);
  const noPrice = input.hasPrice === false;
  return { state: noArea || noPrice ? "coming" : "live", cities, areaNames };
}

/** Whether to link to, list and sell home visits. */
export function homeVisitBookable(offer: HomeVisitOffer): boolean {
  return offer.state === "live";
}

/** "Chennai", "Chennai and Bengaluru", "Chennai, Bengaluru and Pune". */
export function listPlaces(places: string[]): string {
  if (places.length <= 1) return places[0] ?? "";
  return `${places.slice(0, -1).join(", ")} and ${places[places.length - 1]}`;
}

/** The honest line for the "coming" state; never promises a date. */
export function homeVisitComingLine(offer: HomeVisitOffer): string {
  return offer.cities.length > 0
    ? `Home visits are coming to ${listPlaces(offer.cities)}.`
    : "Home visits are coming soon.";
}

/** Largest number of named areas worth printing before the cities say it. */
const MAX_NAMED_AREAS = 5;

/**
 * "We visit: ..." for the live state. A single city with a handful of named
 * areas reads as those areas; otherwise the cities do, because a list of
 * thirty neighbourhoods is the pincode check's job, not a headline's.
 */
export function homeVisitWeVisitLine(offer: HomeVisitOffer): string | null {
  if (offer.cities.length === 0) return null;
  if (
    offer.cities.length === 1 &&
    offer.areaNames.length > 0 &&
    offer.areaNames.length <= MAX_NAMED_AREAS
  ) {
    return `We visit: ${listPlaces(offer.areaNames)}, ${offer.cities[0]}`;
  }
  return `We visit: ${listPlaces(offer.cities)}`;
}
