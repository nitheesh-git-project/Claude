// What the public marketing pages leave out of the catalog.
//
// The e2e suite and manual QA create conditions whose titles start "QA " (QA
// Promo Condition, QA Discount Condition ...) and, on a test site, leave them
// active so a booking can use them. They are real rows, so the booking flow
// still finds them by id; only the pages that *advertise* the catalog (Home's
// "What you can book today" and /conditions) skip them. A production database
// has none, so this costs nothing there.

/** An `ilike` pattern: titles that start with "QA ". */
export const PUBLIC_HIDDEN_TITLE_PATTERN = "QA %";

/** The same rule for rows already in memory. */
export function isPublicCatalogTitle(title: string | null | undefined): boolean {
  return !/^qa\s/i.test((title ?? "").trim());
}
