// What the public FAQ says about home-visit coverage and price.
//
// The FAQ is admin-typed text (Settings -> Public Site -> FAQ), and staging's
// answered "do you visit me, and what does it cost?" with a pincode and two
// rupee figures (600020, ₹499 + ₹100 travel) that had long stopped being
// true: coverage and prices are catalog rows (Catalog -> Service areas,
// Catalog -> Conditions -> Home visits) that move without anyone reopening
// the FAQ. Two halves here:
//
//  - `homeVisitCoverageFaq` is an answer the /faq page builds from the live
//    service-area rows, so the page always carries one that is current. It
//    names cities only, and sends a visitor to the pincode check and the
//    Home Visit page for prices: a public price is a <Price>, never a
//    sentence (docs/rules/public-site.md), and the visit price depends on
//    the condition and the travel fee on the area anyway.
//  - `quotesDriftingFigure` lets the admin form say, at the point of entry,
//    that an answer is about to hard-code a figure that will drift.
//
// Dependency-free so it can be tested without rendering.

export type FaqEntry = { id: string; question: string; answer: string };

export const LIVE_HOME_VISIT_FAQ_ID = "live-home-visit-coverage";

/** "Chennai", "Chennai and Bengaluru", "Chennai, Bengaluru and Pune". */
function listCities(cities: string[]): string {
  if (cities.length <= 1) return cities[0] ?? "";
  return `${cities.slice(0, -1).join(", ")} and ${cities[cities.length - 1]}`;
}

/**
 * The live home-visit answer, or null when no area is served (the page then
 * says nothing about coverage rather than promising none or some).
 */
export function homeVisitCoverageFaq(cityRows: (string | null | undefined)[]): FaqEntry | null {
  const cities = [
    ...new Set(cityRows.map((c) => c?.trim()).filter((c): c is string => Boolean(c))),
  ].sort((a, b) => a.localeCompare(b));
  if (cities.length === 0) return null;
  return {
    id: LIVE_HOME_VISIT_FAQ_ID,
    question: "Do you do home visits in my area, and what do they cost?",
    answer:
      `Home visits are currently available in parts of ${listCities(cities)}. ` +
      "Whether we can reach you depends on your pincode: enter it when you book a home visit and we confirm it before you give an address or pay. " +
      "Each condition's visit price is on the Home Visit page, and any travel fee for your area is shown separately before you pay.",
  };
}

/**
 * Whether an FAQ answer hard-codes a pincode or a rupee amount -- figures
 * that live in the catalog and change without the FAQ being edited.
 */
export function quotesDriftingFigure(text: string): boolean {
  const pincode = /(^|[^\d])\d{3}\s?\d{3}(?!\d)/;
  const rupees = /(₹|\bRs\.?|\bINR)\s?\d/i;
  return pincode.test(text) || rupees.test(text);
}
