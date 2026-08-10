// Shared field validation for /api/admin/create-package and
// /api/admin/update-package -- every field on the catalog form (see the
// Session Manager tab) funnels through here so the two routes can't drift
// on what's allowed. Returns either an error message (first one hit) or
// the normalized, snake_case column values ready to insert/update.

const MAX_TITLE_LENGTH = 200;
const MAX_SUBTITLE_LENGTH = 200;
const MAX_BADGE_LENGTH = 40;
const MAX_TEXT_LENGTH = 4000; // description, terms
const MAX_PROMISES = 20;
const MAX_PROMISE_LENGTH = 200;
const MAX_IMAGE_URL_LENGTH = 2000;

const THERAPIST_RATE_BASIS_VALUES = ["package_actual", "category_list"] as const;
export type TherapistRateBasis = (typeof THERAPIST_RATE_BASIS_VALUES)[number];

export type PackagePayload = {
  title?: string;
  subtitle?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  promises?: string[];
  badgeLabel?: string | null;
  highlight?: boolean;
  terms?: string | null;
  sessionCount?: number | string;
  priceInr?: number | string;
  compareAtInr?: number | string | null;
  displayOrder?: number | string;
  therapistRateBasis?: string;
  validityDays?: number | string | null;
  sessionDurationMinutes?: number | string | null;
  therapistLocked?: boolean;
  minGapHours?: number | string | null;
  maxSessionsPerWeek?: number | string | null;
  maxPurchasesPerPatient?: number | string | null;
  visibleOnHome?: boolean;
  visibleOnConditions?: boolean;
  visibleInDashboard?: boolean;
  active?: boolean;
};

export type PackageColumns = {
  title: string;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  promises: string[];
  badge_label: string | null;
  highlight: boolean;
  terms: string | null;
  session_count: number;
  price_paise: number;
  compare_at_paise: number | null;
  display_order: number;
  therapist_rate_basis: TherapistRateBasis;
  validity_days: number | null;
  session_duration_minutes: number | null;
  therapist_locked: boolean;
  min_gap_hours: number | null;
  max_sessions_per_week: number | null;
  max_purchases_per_patient: number | null;
  visible_on_home: boolean;
  visible_on_conditions: boolean;
  visible_in_dashboard: boolean;
  active: boolean;
};

// A blank string/undefined/null all mean "not set" for an optional
// number field -- distinguishing "0" from "not provided" only matters for
// fields that don't accept 0 anyway (every optional number here must be
// a positive whole number when present).
function parseOptionalPositiveInt(
  value: number | string | null | undefined,
  label: string
): { value: number | null } | { error: string } {
  if (value === undefined || value === null || value === "") return { value: null };
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    return { error: `${label} must be a positive whole number, or left blank.` };
  }
  return { value: n };
}

export function validatePackagePayload(
  body: PackagePayload,
  { requireTitleAndPricing }: { requireTitleAndPricing: boolean }
): { error: string } | { columns: Partial<PackageColumns> } {
  const columns: Partial<PackageColumns> = {};

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

  if (body.promises !== undefined) {
    if (!Array.isArray(body.promises) || body.promises.some((p) => typeof p !== "string")) {
      return { error: "Promises must be a list of text bullets." };
    }
    if (body.promises.length > MAX_PROMISES) {
      return { error: `Please keep it to ${MAX_PROMISES} promises or fewer.` };
    }
    const promises: string[] = [];
    for (const raw of body.promises) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (trimmed.length > MAX_PROMISE_LENGTH) {
        return { error: `Each promise must be ${MAX_PROMISE_LENGTH} characters or fewer.` };
      }
      promises.push(trimmed);
    }
    columns.promises = promises;
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

  if (requireTitleAndPricing || body.sessionCount !== undefined) {
    const count = Number(body.sessionCount);
    if (!Number.isInteger(count) || count < 2) {
      return { error: "Sessions Included must be a whole number of 2 or more." };
    }
    columns.session_count = count;
  }

  if (requireTitleAndPricing || body.priceInr !== undefined) {
    const price = Number(body.priceInr);
    if (Number.isNaN(price) || price <= 0) {
      return { error: "Bundle Price must be a positive number." };
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
      // price_paise may not be present on this partial payload (an edit
      // that only touches compareAtInr) -- the DB's own check constraint
      // (compare_at_paise >= price_paise) is the final backstop either
      // way, but checking here when we can gives a field-level message
      // instead of a raw constraint-violation error.
      if (columns.price_paise !== undefined && compareAtPaise < columns.price_paise) {
        return { error: "Compare-at Price can't be lower than the Bundle Price." };
      }
      columns.compare_at_paise = compareAtPaise;
    }
  }

  if (requireTitleAndPricing || body.displayOrder !== undefined) {
    const order = body.displayOrder === undefined ? 0 : Number(body.displayOrder);
    if (Number.isNaN(order)) {
      return { error: "Order must be a number." };
    }
    columns.display_order = Math.round(order);
  }

  if (body.therapistRateBasis !== undefined) {
    if (!THERAPIST_RATE_BASIS_VALUES.includes(body.therapistRateBasis as TherapistRateBasis)) {
      return { error: "Therapist Pay Basis must be either package_actual or category_list." };
    }
    columns.therapist_rate_basis = body.therapistRateBasis as TherapistRateBasis;
  }

  if (body.validityDays !== undefined) {
    const result = parseOptionalPositiveInt(body.validityDays, "Validity (days)");
    if ("error" in result) return { error: result.error };
    columns.validity_days = result.value;
  }

  if (body.sessionDurationMinutes !== undefined) {
    const result = parseOptionalPositiveInt(body.sessionDurationMinutes, "Session Duration");
    if ("error" in result) return { error: result.error };
    columns.session_duration_minutes = result.value;
  }

  if (body.therapistLocked !== undefined) {
    columns.therapist_locked = Boolean(body.therapistLocked);
  }

  if (body.minGapHours !== undefined) {
    const result = parseOptionalPositiveInt(body.minGapHours, "Minimum gap between sessions");
    if ("error" in result) return { error: result.error };
    columns.min_gap_hours = result.value;
  }

  if (body.maxSessionsPerWeek !== undefined) {
    const result = parseOptionalPositiveInt(body.maxSessionsPerWeek, "Maximum sessions per week");
    if ("error" in result) return { error: result.error };
    columns.max_sessions_per_week = result.value;
  }

  if (body.maxPurchasesPerPatient !== undefined) {
    const result = parseOptionalPositiveInt(
      body.maxPurchasesPerPatient,
      "Maximum purchases per patient"
    );
    if ("error" in result) return { error: result.error };
    columns.max_purchases_per_patient = result.value;
  }

  if (body.visibleOnHome !== undefined) columns.visible_on_home = Boolean(body.visibleOnHome);
  if (body.visibleOnConditions !== undefined)
    columns.visible_on_conditions = Boolean(body.visibleOnConditions);
  if (body.visibleInDashboard !== undefined)
    columns.visible_in_dashboard = Boolean(body.visibleInDashboard);
  if (body.active !== undefined) columns.active = Boolean(body.active);

  return { columns };
}
