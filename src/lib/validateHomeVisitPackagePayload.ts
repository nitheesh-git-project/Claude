// Shared field validation for /api/admin/create-home-visit-package and
// /api/admin/update-home-visit-package -- the direct analogue of
// validatePackagePayload.ts, and kept as its own file for the same reason
// the two catalogues are separate tables: the fields genuinely differ
// (visits vs sessions, travel inclusion vs category rate basis, a different
// visibility surface), and a single validator parameterised over both would
// be harder to follow than two that each say exactly what they allow.
//
// Returns either the first error hit, or the normalized snake_case column
// values ready to insert/update.

const MAX_TITLE_LENGTH = 200;
const MAX_SUBTITLE_LENGTH = 200;
const MAX_BADGE_LENGTH = 40;
const MAX_TEXT_LENGTH = 4000; // description, terms
const MAX_BENEFITS = 20;
const MAX_BENEFIT_LENGTH = 200;
const MAX_IMAGE_URL_LENGTH = 2000;

export type HomeVisitPackagePayload = {
  title?: string;
  subtitle?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  benefits?: string[];
  badgeLabel?: string | null;
  highlight?: boolean;
  terms?: string | null;
  visitCount?: number | string;
  priceInr?: number | string;
  compareAtInr?: number | string | null;
  visitDurationMinutes?: number | string | null;
  validityDays?: number | string | null;
  travelFeeIncluded?: boolean;
  therapistLocked?: boolean;
  minGapHours?: number | string | null;
  maxVisitsPerWeek?: number | string | null;
  maxPurchasesPerPatient?: number | string | null;
  categoryId?: string | null;
  displayOrder?: number | string;
  visibleOnHome?: boolean;
  visibleOnHomeVisitPage?: boolean;
  visibleInDashboard?: boolean;
  active?: boolean;
};

export type HomeVisitPackageColumns = {
  title: string;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  benefits: string[];
  badge_label: string | null;
  highlight: boolean;
  terms: string | null;
  visit_count: number;
  price_paise: number;
  compare_at_paise: number | null;
  visit_duration_minutes: number;
  validity_days: number | null;
  travel_fee_included: boolean;
  therapist_locked: boolean;
  min_gap_hours: number | null;
  max_visits_per_week: number | null;
  max_purchases_per_patient: number | null;
  category_id: string | null;
  display_order: number;
  visible_on_home: boolean;
  visible_on_home_visit_page: boolean;
  visible_in_dashboard: boolean;
  active: boolean;
};

// A blank string/undefined/null all mean "not set" for an optional number
// field -- same reasoning as validatePackagePayload's copy of this: every
// optional number here must be a positive whole number when present, so
// distinguishing 0 from absent never matters.
function parseOptionalPositiveInt(
  value: number | string | null | undefined,
  label: string
): { value: number } | { value: null } | { error: string } {
  if (value === undefined || value === null || value === "") return { value: null };
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    return { error: `${label} must be a positive whole number, or left blank.` };
  }
  return { value: n };
}

export function validateHomeVisitPackagePayload(
  body: HomeVisitPackagePayload,
  { requireTitleAndPricing }: { requireTitleAndPricing: boolean }
): { error: string } | { columns: Partial<HomeVisitPackageColumns> } {
  const columns: Partial<HomeVisitPackageColumns> = {};

  if (requireTitleAndPricing || body.title !== undefined) {
    if (!body.title || !body.title.trim()) {
      return { error: "Package Name is required." };
    }
    if (body.title.length > MAX_TITLE_LENGTH) {
      return { error: `Package Name must be ${MAX_TITLE_LENGTH} characters or fewer.` };
    }
    columns.title = body.title.trim();
  }

  if (body.subtitle !== undefined) {
    if (body.subtitle && body.subtitle.length > MAX_SUBTITLE_LENGTH) {
      return { error: `Subtitle must be ${MAX_SUBTITLE_LENGTH} characters or fewer.` };
    }
    columns.subtitle = body.subtitle?.trim() || null;
  }

  if (body.description !== undefined) {
    if (body.description && body.description.length > MAX_TEXT_LENGTH) {
      return { error: `Description must be ${MAX_TEXT_LENGTH} characters or fewer.` };
    }
    columns.description = body.description?.trim() || null;
  }

  if (body.imageUrl !== undefined) {
    if (body.imageUrl && body.imageUrl.length > MAX_IMAGE_URL_LENGTH) {
      return { error: "Cover image URL is too long." };
    }
    columns.image_url = body.imageUrl?.trim() || null;
  }

  if (body.benefits !== undefined) {
    if (!Array.isArray(body.benefits) || body.benefits.some((b) => typeof b !== "string")) {
      return { error: "Benefits must be a list of text bullets." };
    }
    if (body.benefits.length > MAX_BENEFITS) {
      return { error: `Please keep it to ${MAX_BENEFITS} benefits or fewer.` };
    }
    const benefits: string[] = [];
    for (const raw of body.benefits) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (trimmed.length > MAX_BENEFIT_LENGTH) {
        return { error: `Each benefit must be ${MAX_BENEFIT_LENGTH} characters or fewer.` };
      }
      benefits.push(trimmed);
    }
    columns.benefits = benefits;
  }

  if (body.badgeLabel !== undefined) {
    if (body.badgeLabel && body.badgeLabel.length > MAX_BADGE_LENGTH) {
      return { error: `Badge text must be ${MAX_BADGE_LENGTH} characters or fewer.` };
    }
    columns.badge_label = body.badgeLabel?.trim() || null;
  }

  if (body.highlight !== undefined) {
    columns.highlight = Boolean(body.highlight);
  }

  if (body.terms !== undefined) {
    if (body.terms && body.terms.length > MAX_TEXT_LENGTH) {
      return { error: `Terms must be ${MAX_TEXT_LENGTH} characters or fewer.` };
    }
    columns.terms = body.terms?.trim() || null;
  }

  // 1 is allowed and meaningful, unlike the online packages' minimum of 2:
  // a one-off home visit IS a one-visit package. Keeping single visits in
  // this table rather than as a fourth product is what lets the booking,
  // scheduling and refund paths have exactly one shape to handle.
  if (requireTitleAndPricing || body.visitCount !== undefined) {
    const count = Number(body.visitCount);
    if (!Number.isInteger(count) || count < 1) {
      return { error: "Visits Included must be a whole number of 1 or more." };
    }
    columns.visit_count = count;
  }

  if (requireTitleAndPricing || body.priceInr !== undefined) {
    const price = Number(body.priceInr);
    if (Number.isNaN(price) || price <= 0) {
      return { error: "Package Price must be a positive number." };
    }
    columns.price_paise = Math.round(price * 100);
  }

  if (body.compareAtInr !== undefined) {
    if (body.compareAtInr === null || body.compareAtInr === "") {
      columns.compare_at_paise = null;
    } else {
      const compareAt = Number(body.compareAtInr);
      if (Number.isNaN(compareAt) || compareAt <= 0) {
        return { error: "Compare-at Price must be a positive number, or left blank." };
      }
      const compareAtPaise = Math.round(compareAt * 100);
      // price_paise may be absent on a partial edit that only touches this
      // field. The DB check constraint is the final backstop either way;
      // checking here when we can gives a field-level message instead of a
      // raw constraint violation.
      if (columns.price_paise !== undefined && compareAtPaise < columns.price_paise) {
        return { error: "Compare-at Price can't be lower than the Package Price." };
      }
      columns.compare_at_paise = compareAtPaise;
    }
  }

  // Required (not optional like the online packages' session_duration_minutes,
  // which can fall back to the linked category's duration): a home-visit
  // package has no category to inherit a length from, and the visit's
  // duration is what the therapist's travel-buffered conflict check is
  // computed against.
  if (requireTitleAndPricing || body.visitDurationMinutes !== undefined) {
    const duration = Number(body.visitDurationMinutes);
    if (!Number.isInteger(duration) || duration < 1) {
      return { error: "Visit Duration must be a positive whole number of minutes." };
    }
    columns.visit_duration_minutes = duration;
  }

  if (body.validityDays !== undefined) {
    const result = parseOptionalPositiveInt(body.validityDays, "Validity (days)");
    if ("error" in result) return { error: result.error };
    columns.validity_days = result.value;
  }

  if (body.travelFeeIncluded !== undefined) {
    columns.travel_fee_included = Boolean(body.travelFeeIncluded);
  }

  if (body.therapistLocked !== undefined) {
    columns.therapist_locked = Boolean(body.therapistLocked);
  }

  if (body.minGapHours !== undefined) {
    const result = parseOptionalPositiveInt(body.minGapHours, "Minimum gap between visits");
    if ("error" in result) return { error: result.error };
    columns.min_gap_hours = result.value;
  }

  if (body.maxVisitsPerWeek !== undefined) {
    const result = parseOptionalPositiveInt(body.maxVisitsPerWeek, "Maximum visits per week");
    if ("error" in result) return { error: result.error };
    columns.max_visits_per_week = result.value;
  }

  if (body.maxPurchasesPerPatient !== undefined) {
    const result = parseOptionalPositiveInt(
      body.maxPurchasesPerPatient,
      "Maximum purchases per patient"
    );
    if ("error" in result) return { error: result.error };
    columns.max_purchases_per_patient = result.value;
  }

  // Optional clinical grouping. Existence of the category is checked by the
  // route (which has a DB client); this only normalizes blank to null.
  if (body.categoryId !== undefined) {
    columns.category_id = body.categoryId?.trim() || null;
  }

  if (requireTitleAndPricing || body.displayOrder !== undefined) {
    const order = body.displayOrder === undefined ? 0 : Number(body.displayOrder);
    if (Number.isNaN(order)) {
      return { error: "Order must be a number." };
    }
    columns.display_order = Math.round(order);
  }

  if (body.visibleOnHome !== undefined) columns.visible_on_home = Boolean(body.visibleOnHome);
  if (body.visibleOnHomeVisitPage !== undefined)
    columns.visible_on_home_visit_page = Boolean(body.visibleOnHomeVisitPage);
  if (body.visibleInDashboard !== undefined)
    columns.visible_in_dashboard = Boolean(body.visibleInDashboard);
  if (body.active !== undefined) columns.active = Boolean(body.active);

  return { columns };
}
