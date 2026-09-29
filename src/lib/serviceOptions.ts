// What the public booking wizards offer, as one shape.
//
// Both wizards ask the same question -- "which of these am I buying?" -- of
// two different tables: `/book` reads `treatment_categories`,
// `/book-home-visit` reads `home_visit_packages`. One picker serves both, so
// the rows meet here rather than inside the component: the two mappings are a
// judgement about what a patient is shown (which chips, which price unit,
// which figures in the detail view) and this codebase keeps that kind of
// judgement in a dependency-free module with its own tests, not inside a
// component nobody can run without a browser.
//
// It maps only. Nothing here filters: which rows may be sold at all is
// `isDirectlyPurchasable` in `consultationFirst.ts`, and the callers apply it.

import { computeHomeVisitSavings } from "@/lib/homeVisitProgress";

/** One figure in the detail view. Shaped like `StatTile` in
 *  `CatalogVisuals.tsx` so the component can pass it straight through --
 *  declared here rather than imported from there, because that file is a
 *  client component and this module has to stay importable by a test with no
 *  DOM. */
export type ServiceStat = { label: string; value: string; icon: string };

/**
 * One thing the patient may choose, in the shape both the card and the
 * detail view read.
 *
 * `focalX` / `focalY` are deliberately `number | null` and never defaulted to
 * a number here. `clampFocal` already answers "unset" with dead centre, and
 * it guards `null` and `""` *before* `Number()` for the reason its own
 * docblock gives -- `Number(null)` is `0`, which would pin an unset cover to
 * the top-left corner rather than centring it. Defaulting in this module
 * would hand that function a `0` it could no longer tell from a real one.
 */
export type ServiceOption = {
  id: string;
  title: string;
  /** The line under the title on the card, and under the heading in the
   *  dialog. */
  summary: string | null;
  /** The longer read, shown in the detail view only. */
  about: string | null;
  terms: string | null;
  imageUrl: string | null;
  focalX: number | null;
  focalY: number | null;
  badge: string | null;
  highlight: boolean;
  /** Small grey chips on the card: pre-worded, because what is worth saying
   *  differs by table and a component that worked it out would have to know
   *  about both. */
  meta: string[];
  points: string[];
  pricePaise: number;
  compareAtPaise: number | null;
  savingsPaise: number | null;
  priceUnit: string;
  /** How long one appointment of this is, in minutes -- read by the wizard
   *  header and by the clash pre-check, so it stays a number rather than
   *  being folded into `meta`. */
  durationMinutes: number;
  /** Named above the heading in the detail view. */
  eyebrow: string;
  stats: ServiceStat[];
  /** Vector fallback for a row with no cover. */
  icon: string;
};

/** The columns this module reads off `treatment_categories`. Everything
 *  except the four the page has always selected is optional: those columns
 *  are migration-dependent and are read in their own queries, so a database
 *  mid-migration must still produce a bookable option. */
export type CategoryServiceRow = {
  id: string;
  title: string;
  price_paise: number;
  duration_minutes?: number | null;
  description?: string | null;
  points?: unknown;
  image_url?: string | null;
  image_focal_x?: number | null;
  image_focal_y?: number | null;
};

/** The columns this module reads off `home_visit_packages`. */
export type HomeVisitServiceRow = {
  id: string;
  title: string;
  price_paise: number;
  visit_count: number;
  visit_duration_minutes?: number | null;
  subtitle?: string | null;
  description?: string | null;
  terms?: string | null;
  badge_label?: string | null;
  highlight?: boolean | null;
  benefits?: unknown;
  compare_at_paise?: number | null;
  validity_days?: number | null;
  travel_fee_included?: boolean | null;
  therapist_locked?: boolean | null;
  image_url?: string | null;
  image_focal_x?: number | null;
  image_focal_y?: number | null;
};

/** Both `points` and `benefits` are jsonb, so a hand-edited row can hold an
 *  object, a string or null. Anything that is not an array of non-empty
 *  strings is no list at all -- rendering `[object Object]` as a benefit is
 *  worse than rendering nothing. */
function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
}

/** Absent, null, or anything unusable is `null`, never a number. See the note
 *  on `focalX` above: a `0` here is a position, not an absence. */
function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** An empty or whitespace-only text column is nothing to say, not an empty
 *  paragraph to render. */
function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** What the clinic calls one appointment's length when the column is absent.
 *  Matches `treatment_categories.duration_minutes`'s own default. */
export const DEFAULT_SERVICE_DURATION_MINUTES = 60;

function durationOf(value: unknown): number {
  const n = numberOrNull(value);
  return n !== null && n > 0 ? n : DEFAULT_SERVICE_DURATION_MINUTES;
}

/**
 * The standing fallback condition, by its fixed id.
 *
 * `schema.sql` seeds this row and keeps re-seeding it if it is ever deleted
 * entirely, precisely so "a patient whose issue doesn't match any listed
 * condition" always has somewhere to go and booking never dead-ends. It is
 * identified by id rather than by title on purpose -- an admin may rename it,
 * re-price it or move it in the list, and it is still the same row.
 */
export const GENERAL_CONSULTATION_CATEGORY_ID =
  "00000000-0000-0000-0000-000000000001";

/**
 * Which condition `/book` opens with.
 *
 * Three answers, in order, and the third is the one worth stating:
 *
 * 1. **What the link asked for.** `/book?category=<id>` comes from
 *    `/conditions`, from the patient's own booking screen and from a
 *    therapist's profile, and it is a decision somebody already made.
 * 2. **Otherwise the general consultation**, so somebody who tapped a plain
 *    *Book* button is looking at a bookable session rather than an empty
 *    control. That is what this row exists for.
 * 3. **Otherwise nothing.** Never the first row by display order: which
 *    condition happens to sort first is an admin's ordering decision about a
 *    *list*, not a statement about what a stranger most likely needs, and a
 *    booking pre-filled from it would be a choice nobody made. A database
 *    whose fallback row has been deleted opens the picker unanswered, which
 *    is honest.
 */
export function defaultCategoryId(
  rows: { id: string }[],
  requestedId?: string | null
): string {
  if (requestedId && rows.some((r) => r.id === requestedId)) return requestedId;
  const general = rows.find((r) => r.id === GENERAL_CONSULTATION_CATEGORY_ID);
  return general ? general.id : "";
}

/** A video consultation, from a treatment category. */
export function categoryServiceOption(row: CategoryServiceRow): ServiceOption {
  const duration = durationOf(row.duration_minutes);
  return {
    id: row.id,
    title: row.title,
    summary: textOrNull(row.description),
    about: textOrNull(row.description),
    terms: null,
    imageUrl: textOrNull(row.image_url),
    focalX: numberOrNull(row.image_focal_x),
    focalY: numberOrNull(row.image_focal_y),
    badge: null,
    highlight: false,
    meta: [`${duration} min`, "Video session", "1-on-1"],
    points: stringList(row.points),
    pricePaise: row.price_paise,
    compareAtPaise: null,
    savingsPaise: null,
    priceUnit: `/ ${duration} min session`,
    durationMinutes: duration,
    eyebrow: "Video consultation",
    stats: [
      { label: "Session length", value: `${duration} minutes`, icon: "fa-clock" },
      { label: "Delivered", value: "HD video call", icon: "fa-video" },
      { label: "With", value: "One therapist, 1-on-1", icon: "fa-user-doctor" },
    ],
    icon: "fa-laptop-medical",
  };
}

/** A visit at the patient's own address, from a home-visit package.
 *
 * The travel chip is the one that matters here: `travel_fee_included` decides
 * whether the advertised price is the whole of it or whether the patient's
 * own area adds a fee at checkout, and that is the question the pincode
 * answer on Step 1 goes on to repeat. */
export function homeVisitServiceOption(row: HomeVisitServiceRow): ServiceOption {
  const duration = durationOf(row.visit_duration_minutes);
  const visits = numberOrNull(row.visit_count) ?? 1;
  const single = visits === 1;
  const travelIncluded = row.travel_fee_included === true;
  const savings = computeHomeVisitSavings({
    visitCount: visits,
    pricePaise: row.price_paise,
    compareAtPaise: row.compare_at_paise,
  });

  return {
    id: row.id,
    title: row.title,
    summary: textOrNull(row.subtitle) ?? textOrNull(row.description),
    about: textOrNull(row.description),
    terms: textOrNull(row.terms),
    imageUrl: textOrNull(row.image_url),
    focalX: numberOrNull(row.image_focal_x),
    focalY: numberOrNull(row.image_focal_y),
    badge: textOrNull(row.badge_label),
    highlight: row.highlight === true,
    meta: [
      single ? "Single visit" : `${visits} visits`,
      `${duration} min${single ? "" : " each"}`,
      travelIncluded ? "Travel included" : "Travel by area",
      !single && row.therapist_locked === true ? "Same therapist" : "",
      row.validity_days ? `Valid ${row.validity_days} days` : "",
    ].filter(Boolean),
    points: stringList(row.benefits),
    pricePaise: row.price_paise,
    compareAtPaise: savings.compareAtPaise,
    savingsPaise: savings.savingsPaise,
    priceUnit: single ? "/ visit" : `/ ${visits} visits`,
    durationMinutes: duration,
    eyebrow: "Home visit",
    stats: [
      { label: "Visit length", value: `${duration} minutes`, icon: "fa-clock" },
      {
        label: "Travel",
        value: travelIncluded ? "Included" : "Added for your area",
        icon: "fa-car",
      },
      { label: "Visits", value: single ? "1 visit" : `${visits} visits`, icon: "fa-house-medical" },
      ...(row.validity_days
        ? [{ label: "Book within", value: `${row.validity_days} days`, icon: "fa-calendar-day" }]
        : []),
      ...(!single && row.therapist_locked === true
        ? [{ label: "Therapist", value: "The same one throughout", icon: "fa-user-doctor" }]
        : []),
    ],
    icon: "fa-house-medical",
  };
}
