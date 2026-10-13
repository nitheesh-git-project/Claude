// What one home visit costs, for any condition.
//
// The owner's model, from Catalog -> Conditions -> Home visits: there is ONE
// clinic-wide home-visit price, and any condition may set its own price
// instead. Always one visit -- no visit count, no validity, no days. Travel
// is added per visit from Service Areas, unless the price row says it is
// included.
//
// It is stored on `home_visit_packages` rather than in a new table, because
// both purchase tables need a `package_id` and every booking route already
// reads its terms through one:
//
//   - a row with `visit_count = 1`, `care_plan_course = false`, `active` and
//     `category_id is null` is the clinic-wide price;
//   - the same with a `category_id` is that condition's own price.
//
// `home_visit_packages_one_rate_per_category` (end of schema.sql) allows at
// most one active row per key. A database that has not applied it yet can
// still hold two, so every reader here picks the same one the migration
// keeps: the cheapest, then the oldest, then the lowest id. That is also what
// `loadRecommendableRates` used to charge, so applying the migration moves
// no price anybody was being quoted.
//
// Multi-visit rows and course rows are not prices and are ignored here. They
// stay in the table untouched, because old purchases point at them.
//
// Dependency-free so the rule is unit-tested rather than clicked.

import { isDirectlyPurchasable } from "@/lib/consultationFirst";

/** The columns this module reads off `home_visit_packages`. */
export type HomeVisitPriceRow = {
  id: string;
  category_id: string | null;
  price_paise: number;
  visit_count: number;
  visit_duration_minutes?: number | null;
  travel_fee_included?: boolean | null;
  /** Absent reads as false: only a course row carries `true`. */
  care_plan_course?: boolean | null;
  /** Absent reads as active: callers usually filter on it in the query. */
  active?: boolean | null;
  created_at?: string | null;
};

/** One visit's price, as every screen and route reads it. */
export type HomeVisitRate = {
  /** The `home_visit_packages` row a purchase at this price hangs off. */
  packageId: string;
  /** The row's own condition; null for the clinic-wide price. */
  rowCategoryId: string | null;
  pricePaise: number;
  durationMinutes: number;
  travelFeeIncluded: boolean;
  /** `own` when the condition set its own price, `clinic` when it uses the
   *  clinic-wide one. */
  source: "own" | "clinic";
};

/** What a home visit lasts when the row does not say. Matches the column's
 *  own default. */
export const DEFAULT_HOME_VISIT_MINUTES = 60;

/** Whether a row is a home-visit price at all (rather than a programme, a
 *  course anchor, a switched-off row or a placeholder). */
export function isHomeVisitPriceRow(row: HomeVisitPriceRow): boolean {
  return (
    row.active !== false &&
    row.visit_count === 1 &&
    row.care_plan_course !== true &&
    Number.isInteger(row.price_paise) &&
    row.price_paise > 0
  );
}

function compareRows(a: HomeVisitPriceRow, b: HomeVisitPriceRow): number {
  if (a.price_paise !== b.price_paise) return a.price_paise - b.price_paise;
  const at = createdMs(a.created_at);
  const bt = createdMs(b.created_at);
  if (at !== bt) return at < bt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** An unknown or unreadable creation time sorts last, never first. */
function createdMs(value: string | null | undefined): number {
  const ms = value ? Date.parse(value) : NaN;
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/** The one price row for a key (null = clinic-wide), picked the way the
 *  migration's reconcile step does. */
function pickPriceRow(rows: HomeVisitPriceRow[], categoryId: string | null): HomeVisitPriceRow | null {
  const candidates = rows.filter(
    (r) => isHomeVisitPriceRow(r) && (r.category_id ?? null) === categoryId
  );
  if (candidates.length === 0) return null;
  return [...candidates].sort(compareRows)[0];
}

function toRate(row: HomeVisitPriceRow, source: HomeVisitRate["source"]): HomeVisitRate {
  const minutes = row.visit_duration_minutes;
  return {
    packageId: row.id,
    rowCategoryId: row.category_id ?? null,
    pricePaise: row.price_paise,
    durationMinutes:
      typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0
        ? minutes
        : DEFAULT_HOME_VISIT_MINUTES,
    travelFeeIncluded: row.travel_fee_included === true,
    source,
  };
}

/** The clinic-wide price, or null when none is set. */
export function clinicWideHomeVisitRate(rows: HomeVisitPriceRow[]): HomeVisitRate | null {
  const row = pickPriceRow(rows, null);
  return row ? toRate(row, "clinic") : null;
}

/** A condition's own price, or null when it uses the clinic-wide one. */
export function ownHomeVisitRate(
  rows: HomeVisitPriceRow[],
  categoryId: string
): HomeVisitRate | null {
  const row = pickPriceRow(rows, categoryId);
  return row ? toRate(row, "own") : null;
}

/**
 * What one home visit for this condition costs: its own price, else the
 * clinic-wide price, else null (nothing to sell). Never "the cheapest of any
 * condition" -- that fallback priced one condition's visit at another's.
 */
export function effectiveHomeVisitRate(
  rows: HomeVisitPriceRow[],
  categoryId: string
): HomeVisitRate | null {
  return ownHomeVisitRate(rows, categoryId) ?? clinicWideHomeVisitRate(rows);
}

/** Every condition with a price, in the order given. A condition with no
 *  price (no own price and no clinic-wide one) is left out -- there is
 *  nothing to sell it at. */
export function homeVisitRatesFor<C extends { id: string }>(
  categories: C[],
  rows: HomeVisitPriceRow[]
): { category: C; rate: HomeVisitRate }[] {
  const out: { category: C; rate: HomeVisitRate }[] = [];
  for (const category of categories) {
    const rate = effectiveHomeVisitRate(rows, category.id);
    if (rate) out.push({ category, rate });
  }
  return out;
}

/** One condition's line on Catalog -> Conditions -> Home visits. */
export type HomeVisitPriceLine = {
  categoryId: string;
  title: string;
  /** Its own price, or null when it uses the clinic-wide one. */
  own: HomeVisitRate | null;
  /** What a visit for it actually costs today (own, else clinic-wide);
   *  null when neither is set, so it is not on sale. */
  effective: HomeVisitRate | null;
};

/** The admin list: the clinic-wide price, then every condition with what it
 *  charges and why. Conditions keep the order given. */
export function homeVisitPriceListing(
  rows: HomeVisitPriceRow[],
  conditions: { id: string; title: string }[]
): { clinicWide: HomeVisitRate | null; lines: HomeVisitPriceLine[] } {
  const clinicWide = clinicWideHomeVisitRate(rows);
  return {
    clinicWide,
    lines: conditions.map((c) => {
      const own = ownHomeVisitRate(rows, c.id);
      return { categoryId: c.id, title: c.title, own, effective: own ?? clinicWide };
    }),
  };
}

/** Why a home visit could not be sold. */
export type HomeVisitSaleRefusal =
  /** Neither a condition nor a price row was named. */
  | "missing"
  /** The condition is not one the clinic offers (unknown or switched off). */
  | "unknown_condition"
  /** Nothing to sell it at: no own price and no clinic-wide price. */
  | "unpriced"
  /** An old link to a course of visits -- recommended, never chosen. */
  | "programme"
  /** An old link to a row that is not a current price. */
  | "unavailable";

export type HomeVisitSale =
  | { ok: true; rate: HomeVisitRate; categoryId: string | null }
  | { ok: false; reason: HomeVisitSaleRefusal };

/**
 * What a home-visit checkout sells, decided from the server's own rows.
 *
 * A condition is the normal request: it is sold at its effective price.
 * A `packageId` is the old `?package=` link and is honoured only while that
 * row is still a *current* price (the one this module would pick for its
 * key) -- an old clinic-wide row that a newer one replaced, or a condition
 * price that was switched off, is refused rather than sold at a figure the
 * catalogue no longer shows. A condition wins when both are sent.
 *
 * Never an amount: the browser names what it wants, and the price is the
 * row's.
 */
export function resolveHomeVisitSale({
  priceRows,
  activeCategoryIds,
  categoryId,
  packageId,
  requestedRow,
}: {
  /** Every current price row (active, one visit, not a course). */
  priceRows: HomeVisitPriceRow[];
  activeCategoryIds: ReadonlySet<string>;
  categoryId?: string | null;
  packageId?: string | null;
  /** The row `packageId` names, read by id whatever its state; null when
   *  there is none. Only consulted when no condition was sent. */
  requestedRow?: HomeVisitPriceRow | null;
}): HomeVisitSale {
  if (categoryId) {
    if (!activeCategoryIds.has(categoryId)) return { ok: false, reason: "unknown_condition" };
    const rate = effectiveHomeVisitRate(priceRows, categoryId);
    return rate ? { ok: true, rate, categoryId } : { ok: false, reason: "unpriced" };
  }
  if (!packageId) return { ok: false, reason: "missing" };
  if (!requestedRow || requestedRow.id !== packageId) return { ok: false, reason: "unavailable" };
  if (!isDirectlyPurchasable(requestedRow.visit_count)) return { ok: false, reason: "programme" };

  const key = requestedRow.category_id ?? null;
  if (key !== null && !activeCategoryIds.has(key)) return { ok: false, reason: "unavailable" };
  const current = pickPriceRow(priceRows, key);
  if (!current || current.id !== requestedRow.id) return { ok: false, reason: "unavailable" };
  return { ok: true, rate: toRate(current, key === null ? "clinic" : "own"), categoryId: key };
}

/** What a checkout says when it refuses. One sentence each, in the
 *  patient's words. `programme` is answered by the caller with
 *  `PROGRAMME_NEEDS_RECOMMENDATION`, the sentence every programme refusal
 *  uses. */
export const HOME_VISIT_SALE_MESSAGES: Record<Exclude<HomeVisitSaleRefusal, "programme">, string> = {
  missing: "Choose what the visit is for.",
  unknown_condition: "That condition isn't offered for home visits right now. Please choose another.",
  unpriced: "Home visits aren't priced yet. Please contact the clinic.",
  unavailable: "That visit isn't available any more. Please choose what the visit is for and try again.",
};

/**
 * Which condition an old `/book-home-visit?package=<id>` link opens on.
 *
 * A condition's own price row opens that condition; the clinic-wide row (or
 * any single-visit row whose condition is gone) opens the general
 * consultation through `fallbackCategoryId`; a course of visits is answered
 * as a programme, never quietly swapped for one visit.
 */
export function categoryForLegacyPackageLink(
  row: { category_id: string | null; visit_count: number } | null,
  offeredCategoryIds: ReadonlySet<string>,
  fallbackCategoryId: string
): { programme: true } | { programme: false; categoryId: string } {
  if (row && !isDirectlyPurchasable(row.visit_count)) return { programme: true };
  if (row?.category_id && offeredCategoryIds.has(row.category_id)) {
    return { programme: false, categoryId: row.category_id };
  }
  return { programme: false, categoryId: fallbackCategoryId };
}

/** Where a home-visit card's Book button goes: the wizard, opened on that
 *  condition. One shape for /home-visit and the booking hub. */
export function homeVisitBookHref(categoryId: string): string {
  return `/book-home-visit?category=${encodeURIComponent(categoryId)}`;
}

/** A rupee figure typed into the admin form, as integer paise; null when it
 *  is not a positive amount with at most two decimals. */
export function parseRupeesToPaise(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  const paise = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}
