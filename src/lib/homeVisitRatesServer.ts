import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HOME_VISIT_SALE_MESSAGES,
  homeVisitRatesFor,
  resolveHomeVisitSale,
  type HomeVisitPriceRow,
  type HomeVisitRate,
} from "@/lib/homeVisitRates";
import { PROGRAMME_NEEDS_RECOMMENDATION } from "@/lib/consultationFirst";
import type { HomeVisitConditionRow } from "@/lib/serviceOptions";

// The reads behind src/lib/homeVisitRates.ts. Shared so the public pages,
// the booking hub, both checkouts, the recommendation picker and the admin
// screen cannot each select a slightly different set of rows and disagree
// about what a visit costs.

/** Every column homeVisitRates.ts reads, as one string literal so
 *  supabase-js can infer the row type. */
export const HOME_VISIT_PRICE_SELECT =
  "id, category_id, price_paise, visit_count, visit_duration_minutes, travel_fee_included, care_plan_course, active, created_at";

/**
 * Every current home-visit price row: active, one visit, not a course.
 *
 * Works with the service-role client and the public one alike (the
 * `home_visit_packages_select_active` policy lets anybody read an active
 * row). Answers null when the read failed, so a caller can say "couldn't
 * load the price" rather than "there is no price".
 */
export async function loadHomeVisitPriceRows(
  client: SupabaseClient
): Promise<HomeVisitPriceRow[] | null> {
  try {
    const { data, error } = await client
      .from("home_visit_packages")
      .select(HOME_VISIT_PRICE_SELECT)
      .eq("active", true)
      .eq("visit_count", 1)
      .eq("care_plan_course", false);
    if (error) return null;
    return (data ?? []) as HomeVisitPriceRow[];
  } catch {
    return null;
  }
}

/** A condition as the home-visit pages and the booking hub list it. */
export type HomeVisitConditionListing = HomeVisitConditionRow & {
  /** Whether the condition leads the page (`treatment_categories.featured`). */
  featured: boolean;
  /** The price row a purchase hangs off. Never sent back by a browser as
   *  anything but a hint: both checkouts re-resolve it from the condition. */
  priceRowId: string;
  /** True when the condition set its own price. */
  ownPrice: boolean;
};

/**
 * Every active condition that carries a home-visit price, in display order,
 * with its cover, focal point and featured flag -- each of those read in its
 * own call, because they are newer columns and one unknown-column error must
 * cost a picture rather than the list. A condition with no price (no own
 * price and no clinic-wide one) is left out.
 *
 * `failed` is true when the conditions or the prices could not be read, so
 * the page can say "couldn't load" rather than "nothing to book".
 */
export async function loadHomeVisitConditions(
  client: SupabaseClient
): Promise<{ conditions: HomeVisitConditionListing[]; failed: boolean }> {
  const soft = async <T>(run: () => PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> => {
    try {
      const { data, error } = await run();
      return error ? null : data;
    } catch {
      return null;
    }
  };

  type CategoryRow = { id: string; title: string; description: string | null; points: unknown };
  const [categories, images, focals, featured, priceRows] = await Promise.all([
    soft<CategoryRow[]>(() =>
      client
        .from("treatment_categories")
        .select("id, title, description, points")
        .eq("active", true)
        .order("display_order", { ascending: true })
        .order("id", { ascending: true })
    ),
    soft<{ id: string; image_url: string | null }[]>(() =>
      client.from("treatment_categories").select("id, image_url").eq("active", true)
    ),
    soft<{ id: string; image_focal_x: number | null; image_focal_y: number | null }[]>(() =>
      client.from("treatment_categories").select("id, image_focal_x, image_focal_y").eq("active", true)
    ),
    soft<{ id: string; featured: boolean | null }[]>(() =>
      client.from("treatment_categories").select("id, featured").eq("active", true)
    ),
    loadHomeVisitPriceRows(client),
  ]);

  if (!categories || !priceRows) return { conditions: [], failed: true };

  const imageById = new Map((images ?? []).map((r) => [r.id, r.image_url]));
  const focalById = new Map((focals ?? []).map((r) => [r.id, r]));
  const featuredById = new Map((featured ?? []).map((r) => [r.id, r.featured === true]));

  const conditions = homeVisitRatesFor(categories, priceRows).map(({ category, rate }) => ({
    id: category.id,
    title: category.title,
    description: category.description,
    points: Array.isArray(category.points) ? category.points : [],
    image_url: imageById.get(category.id) ?? null,
    image_focal_x: focalById.get(category.id)?.image_focal_x ?? null,
    image_focal_y: focalById.get(category.id)?.image_focal_y ?? null,
    featured: featuredById.get(category.id) ?? false,
    price_paise: rate.pricePaise,
    visit_duration_minutes: rate.durationMinutes,
    travel_fee_included: rate.travelFeeIncluded,
    priceRowId: rate.packageId,
    ownPrice: rate.source === "own",
  }));
  return { conditions, failed: false };
}

/**
 * What a home-visit checkout sells, resolved from the server's own rows --
 * both `create-order` and `book-cash` call this, so the two payment methods
 * cannot price one visit differently. The browser names a condition (or, on
 * an old link, a price row); the price, the row and the condition title are
 * all read here. See `resolveHomeVisitSale` for the rule.
 *
 * A read that failed is a 503 ("try again"), never "not available".
 */
export async function resolveHomeVisitSaleOnServer(
  admin: SupabaseClient,
  request: { categoryId?: unknown; packageId?: unknown }
): Promise<
  | { ok: true; rate: HomeVisitRate; categoryId: string | null; categoryTitle: string | null }
  | { ok: false; status: number; error: string }
> {
  const categoryId = typeof request.categoryId === "string" && request.categoryId ? request.categoryId : null;
  const packageId = typeof request.packageId === "string" && request.packageId ? request.packageId : null;
  if (!categoryId && !packageId) {
    return { ok: false, status: 400, error: HOME_VISIT_SALE_MESSAGES.missing };
  }

  const [priceRows, categoriesRead, requestedRead] = await Promise.all([
    loadHomeVisitPriceRows(admin),
    admin.from("treatment_categories").select("id, title").eq("active", true),
    !categoryId && packageId
      ? admin.from("home_visit_packages").select(HOME_VISIT_PRICE_SELECT).eq("id", packageId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (!priceRows || categoriesRead.error || requestedRead.error) {
    return {
      ok: false,
      status: 503,
      error: "We couldn't check the visit price just now. Please try again.",
    };
  }

  const titles = new Map(
    ((categoriesRead.data ?? []) as { id: string; title: string }[]).map((c) => [c.id, c.title])
  );
  const sale = resolveHomeVisitSale({
    priceRows,
    activeCategoryIds: new Set(titles.keys()),
    categoryId,
    packageId,
    requestedRow: (requestedRead.data as HomeVisitPriceRow | null) ?? null,
  });
  if (!sale.ok) {
    if (sale.reason === "programme") {
      return { ok: false, status: 403, error: PROGRAMME_NEEDS_RECOMMENDATION };
    }
    return { ok: false, status: 400, error: HOME_VISIT_SALE_MESSAGES[sale.reason] };
  }
  return {
    ok: true,
    rate: sale.rate,
    categoryId: sale.categoryId,
    categoryTitle: sale.categoryId ? titles.get(sale.categoryId) ?? null : null,
  };
}

/**
 * Which condition a paid single visit is booked under, at verify time.
 *
 * A condition's own price row names its condition, and that wins. The
 * clinic-wide row names none, so the condition the patient chose comes back
 * with the verify call -- accepted only if it is a condition the clinic
 * offers. It decides the appointment's label (`category_id`, and `concern`
 * when the patient wrote none), never the price or who may book: the money
 * was fixed by create-order from the server's own rows. Null when nothing
 * usable was named.
 */
export async function resolveVisitCategory(
  admin: SupabaseClient,
  rowCategoryId: string | null,
  requestedCategoryId: unknown
): Promise<{ categoryId: string; title: string } | null> {
  const id =
    rowCategoryId ??
    (typeof requestedCategoryId === "string" && requestedCategoryId ? requestedCategoryId : null);
  if (!id) return null;
  try {
    let query = admin.from("treatment_categories").select("id, title").eq("id", id);
    // A condition's own row is honoured even if the condition was switched
    // off since checkout; a browser-named one must still be on offer.
    if (!rowCategoryId) query = query.eq("active", true);
    const { data } = await query.maybeSingle();
    return data ? { categoryId: data.id as string, title: data.title as string } : null;
  } catch {
    return null;
  }
}
