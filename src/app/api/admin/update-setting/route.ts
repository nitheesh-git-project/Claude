import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import {
  MAX_SPLASH_HOLD_SECONDS,
  MAX_SPLASH_PHRASE_LENGTH,
  MAX_SPLASH_REVISIT_MINUTES,
  MIN_SPLASH_HOLD_SECONDS,
} from "@/lib/splashScreen";

const ALLOWED_COLUMNS = new Set([
  "therapist_suggestions_enabled",
  "session_packages_visible",
  "session_timeout_minutes",
  "google_meet_enabled",
  "join_window_minutes",
  "join_window_after_minutes",
  "session_completed_after_minutes",
  "booking_languages",
  "package_default_validity_days",
  "package_therapist_lock_enabled",
  "package_bulk_schedule_max",
  "package_expiry_reminder_days",
  "site_name",
  "site_tagline",
  "site_description",
  "contact_email",
  "whatsapp_number",
  "contact_phone",
  "footer_copyright_text",
  "home_visit_enabled",
  "home_visit_cash_enabled",
  "home_visit_lead_time_hours",
  "home_visit_cancellation_refund_hours",
  "home_visit_default_validity_days",
  "home_visit_bulk_schedule_max",
  "home_visit_travel_buffer_minutes",
  "home_visit_page_heading",
  "home_visit_page_subheading",
  // The online twins of home_visit_lead_time_hours /
  // home_visit_cancellation_refund_hours. Same rule, same level of control:
  // changing the online refund window used to need a deploy.
  "online_booking_lead_time_hours",
  "online_cancellation_refund_hours",
  // Drives the automatic payment-fee cost line on the Money screens.
  "payment_gateway_fee_percent",
  // How long the post-logout banner stays up. 0 = until dismissed.
  "farewell_banner_seconds",
  "journey_step_seconds",
  // The opening splash: on/off, its one line, how long it holds, and how
  // long a tab must be away to earn a second greeting.
  "splash_enabled",
  "splash_phrase",
  "splash_hold_seconds",
  "splash_revisit_minutes",
]);

// The home page walkthrough's rotation pace. Neither of the numeric rules
// below fits it: 0 is legal (it means "don't rotate"), but 1 is not -- a
// one-second step is unreadable, which is a worse outcome than a widget
// that never advances. The ceiling is a typo guard.
const MIN_JOURNEY_STEP_SECONDS = 2;
const MAX_JOURNEY_STEP_SECONDS = 60;

// Bounds on the admin-managed /book language list -- not business rules so
// much as guards against a single fat-fingered paste becoming an unusable
// wall of chips on the booking page.
// The one numeric setting that is legitimately fractional -- gateway rates
// are quoted as 2%, 2.36%, and rounding to a whole number would put a
// visible error into the profit figure it feeds. Capped at 100 because a fee
// larger than the payment is not a fee, and a typo here silently changes
// what the business reports as profit.
function isValidGatewayFeePercent(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

const MAX_BOOKING_LANGUAGES = 25;
const MAX_LANGUAGE_LENGTH = 40;

// Bounds on the Brand & Contact Details text fields -- these render in the
// Navbar/Footer on every public page, so a blank or wildly long value would
// break layout there, not just look odd in the admin form.
const BRAND_TEXT_FIELDS = new Set(["site_name", "site_tagline", "footer_copyright_text"]);
const MAX_BRAND_TEXT_LENGTH = 120;
const LONG_TEXT_FIELDS = new Set(["site_description"]);
const MAX_LONG_TEXT_LENGTH = 300;
const CONTACT_FIELDS = new Set(["whatsapp_number", "contact_phone"]);
const MAX_CONTACT_LENGTH = 40;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The /home-visit page's hero copy. Longer bounds than the brand fields --
// this is a headline and a supporting sentence on one page, not a string
// repeated in the Navbar on every page -- and blank is allowed, since
// parseAdminSettings() falls back to DEFAULT_HOME_VISIT_PAGE_* for an empty
// value rather than rendering nothing.
const HOME_VISIT_COPY_FIELDS = new Set([
  "home_visit_page_heading",
  "home_visit_page_subheading",
]);
const MAX_HOME_VISIT_HEADING_LENGTH = 120;
const MAX_HOME_VISIT_SUBHEADING_LENGTH = 300;

// Writes one Feature Control column on the site_settings singleton row --
// same table/pattern as /api/admin/set-ratings-visible-publicly, just
// generalized to any of this feature's columns instead of one dedicated
// route per toggle.
export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { key, value } = await request.json();
  if (typeof key !== "string" || !ALLOWED_COLUMNS.has(key)) {
    return NextResponse.json({ error: "Unknown setting key" }, { status: 400 });
  }
  if (
    (key === "session_packages_visible" ||
      key === "google_meet_enabled" ||
      key === "package_therapist_lock_enabled" ||
      key === "home_visit_enabled" ||
      key === "home_visit_cash_enabled" ||
      key === "therapist_suggestions_enabled" ||
      key === "splash_enabled") &&
    typeof value !== "boolean"
  ) {
    return NextResponse.json({ error: "value must be a boolean" }, { status: 400 });
  }
  if (key === "payment_gateway_fee_percent" && !isValidGatewayFeePercent(value)) {
    return NextResponse.json(
      { error: "Enter a percentage between 0 and 100." },
      { status: 400 }
    );
  }
  if (
    (key === "session_timeout_minutes" ||
      key === "join_window_minutes" ||
      key === "join_window_after_minutes" ||
      key === "package_expiry_reminder_days" ||
      // A zero travel buffer is meaningful: it means "don't pad home-visit
      // conflict checks at all", which is the correct setting for a
      // single-neighbourhood operation.
      key === "home_visit_travel_buffer_minutes" ||
      // Zero here means "no cancellation grace period" -- every
      // cancellation forfeits. A real (if harsh) policy, so not excluded.
      key === "home_visit_cancellation_refund_hours" ||
      // Same two rules on the online side. Zero lead time is legitimate
      // here in a way it isn't for a home visit -- an online session needs
      // a free therapist, not a therapist who can physically arrive -- and
      // zero refund hours is the same harsh-but-real policy as above.
      key === "online_booking_lead_time_hours" ||
      key === "online_cancellation_refund_hours" ||
      // Zero means "leave the goodbye banner up until someone dismisses
      // it", which is what it did before it was configurable.
      key === "farewell_banner_seconds") &&
    (typeof value !== "number" || !Number.isInteger(value) || value < 0)
  ) {
    return NextResponse.json(
      { error: "value must be a non-negative whole number" },
      { status: 400 }
    );
  }
  // Matches the column's own check constraint, so a value the database
  // would reject is refused here with a sentence rather than a 500.
  if (key === "farewell_banner_seconds" && typeof value === "number" && value > 300) {
    return NextResponse.json(
      { error: "Keep this to 300 seconds or less." },
      { status: 400 }
    );
  }
  if (key === "journey_step_seconds") {
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      (value !== 0 &&
        (value < MIN_JOURNEY_STEP_SECONDS || value > MAX_JOURNEY_STEP_SECONDS))
    ) {
      return NextResponse.json(
        {
          error: `value must be 0 (no auto-advance) or between ${MIN_JOURNEY_STEP_SECONDS} and ${MAX_JOURNEY_STEP_SECONDS} seconds`,
        },
        { status: 400 }
      );
    }
  }
  // The splash's own three values. The hold is the one timing in this file
  // that is legitimately fractional -- a second and a half is the point of
  // it, and rounding to whole seconds would make the only two useful
  // settings 1 and 2. Zero minutes away is legal and means "greet the first
  // load of a tab only"; there is deliberately no value meaning "greet on
  // every tab focus", which would splash over a checkout in progress.
  if (key === "splash_hold_seconds") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < MIN_SPLASH_HOLD_SECONDS ||
      value > MAX_SPLASH_HOLD_SECONDS
    ) {
      return NextResponse.json(
        {
          error: `Hold must be between ${MIN_SPLASH_HOLD_SECONDS} and ${MAX_SPLASH_HOLD_SECONDS} seconds.`,
        },
        { status: 400 }
      );
    }
  }
  if (key === "splash_revisit_minutes") {
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > MAX_SPLASH_REVISIT_MINUTES
    ) {
      return NextResponse.json(
        {
          error: `Use 0 for first load only, or up to ${MAX_SPLASH_REVISIT_MINUTES} minutes.`,
        },
        { status: 400 }
      );
    }
  }

  // Unlike the timers above, these two are a divisor and a loop bound
  // downstream (per-session validity math, the bulk scheduler's date
  // limit) -- zero is meaningless for either, so they're held to > 0
  // rather than >= 0, matching the DB check constraints on the matching
  // site_settings columns.
  if (
    (key === "package_default_validity_days" ||
      key === "package_bulk_schedule_max" ||
      key === "home_visit_default_validity_days" ||
      key === "home_visit_bulk_schedule_max" ||
      // Zero would mark a session finished the moment it was due to start,
      // so this one is held to at least a minute like the bounds above.
      key === "session_completed_after_minutes" ||
      // A zero-hour lead time would let someone book a visit for a slot
      // that has already started, with no chance of a therapist reaching
      // the address -- the whole point of this setting being separate from
      // the online lead time is that travel takes real hours.
      key === "home_visit_lead_time_hours") &&
    (typeof value !== "number" || !Number.isInteger(value) || value < 1)
  ) {
    return NextResponse.json({ error: "value must be a positive whole number" }, { status: 400 });
  }

  // Normalized here rather than trusted from the client: this list is
  // rendered as-is to every visitor on /book, and it's the one setting
  // whose value is free text instead of a bounded number/boolean.
  let nextValue = value;
  if (key === "booking_languages") {
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
      return NextResponse.json({ error: "value must be an array of strings" }, { status: 400 });
    }
    const seen = new Set<string>();
    const languages: string[] = [];
    for (const entry of value as string[]) {
      const trimmed = entry.trim();
      if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
      if (trimmed.length > MAX_LANGUAGE_LENGTH) {
        return NextResponse.json(
          { error: `Language names must be ${MAX_LANGUAGE_LENGTH} characters or fewer.` },
          { status: 400 }
        );
      }
      seen.add(trimmed.toLowerCase());
      languages.push(trimmed);
    }
    if (languages.length === 0) {
      return NextResponse.json(
        { error: "Keep at least one language — booking needs something to offer." },
        { status: 400 }
      );
    }
    if (languages.length > MAX_BOOKING_LANGUAGES) {
      return NextResponse.json(
        { error: `Please keep the list to ${MAX_BOOKING_LANGUAGES} languages or fewer.` },
        { status: 400 }
      );
    }
    nextValue = languages;
  }

  if (BRAND_TEXT_FIELDS.has(key) || LONG_TEXT_FIELDS.has(key) || CONTACT_FIELDS.has(key)) {
    if (typeof value !== "string" || value.trim().length === 0) {
      return NextResponse.json({ error: "value must not be blank" }, { status: 400 });
    }
    const maxLength = BRAND_TEXT_FIELDS.has(key)
      ? MAX_BRAND_TEXT_LENGTH
      : LONG_TEXT_FIELDS.has(key)
        ? MAX_LONG_TEXT_LENGTH
        : MAX_CONTACT_LENGTH;
    if (value.length > maxLength) {
      return NextResponse.json(
        { error: `Please keep this to ${maxLength} characters or fewer.` },
        { status: 400 }
      );
    }
    nextValue = value.trim();
  }

  if (HOME_VISIT_COPY_FIELDS.has(key)) {
    if (typeof value !== "string") {
      return NextResponse.json({ error: "value must be text" }, { status: 400 });
    }
    const maxLength =
      key === "home_visit_page_heading"
        ? MAX_HOME_VISIT_HEADING_LENGTH
        : MAX_HOME_VISIT_SUBHEADING_LENGTH;
    if (value.length > maxLength) {
      return NextResponse.json(
        { error: `Please keep this to ${maxLength} characters or fewer.` },
        { status: 400 }
      );
    }
    nextValue = value.trim();
  }

  // Blank is not allowed: the sheet is a full screen of teal with the
  // brand mark on it, and an empty line makes it look like a failed load
  // rather than a greeting. An admin who wants no splash turns it off.
  if (key === "splash_phrase") {
    if (typeof value !== "string" || value.trim().length === 0) {
      return NextResponse.json({ error: "value must not be blank" }, { status: 400 });
    }
    if (value.trim().length > MAX_SPLASH_PHRASE_LENGTH) {
      return NextResponse.json(
        { error: `Please keep this to ${MAX_SPLASH_PHRASE_LENGTH} characters or fewer.` },
        { status: 400 }
      );
    }
    nextValue = value.trim();
  }

  if (key === "contact_email") {
    if (typeof value !== "string" || !EMAIL_RE.test(value.trim())) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    nextValue = value.trim();
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("site_settings")
    .update({ [key]: nextValue })
    .eq("id", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "setting.update",
    targetLabel: key,
    details: { value: nextValue },
  });

  // /book is ISR-cached (revalidate = 300), so without this an edited
  // language list would take up to five minutes to reach patients. Marks
  // the path stale so the next visitor renders the new list instead.
  if (key === "booking_languages") {
    revalidatePath("/book");
  }

  // /home-visit is ISR-cached the same way /book is, and both the master
  // switch and the hero copy change what it renders -- including whether it
  // renders at all. The Navbar's Home Visit link is driven by the same flag
  // from the root layout, so flipping the switch also has to invalidate the
  // layout, not just this one page.
  if (HOME_VISIT_COPY_FIELDS.has(key)) {
    revalidatePath("/home-visit");
  }
  if (key === "home_visit_enabled") {
    revalidatePath("/home-visit");
    revalidatePath("/", "layout");
  }

  // The home page is ISR-cached (revalidate = 300) and reads this value at
  // render time, so without this an admin would change the pace and watch
  // the old one keep running for up to five minutes.
  if (key === "journey_step_seconds") {
    revalidatePath("/");
  }

  // Brand & Contact Details render in the Navbar/Footer, which sit in the
  // root layout wrapping every statically-rendered page -- "layout" scope
  // invalidates the whole site's cache under it in one call, rather than
  // guessing which individual routes need a fresh copy.
  if (
    BRAND_TEXT_FIELDS.has(key) ||
    LONG_TEXT_FIELDS.has(key) ||
    CONTACT_FIELDS.has(key) ||
    key === "contact_email" ||
    // The sign-out banner's duration is read by the root layout too, so it
    // needs the same layout-wide invalidation -- otherwise the new value
    // reaches nobody until the ISR window expires.
    key === "farewell_banner_seconds" ||
    // The opening splash is read by the root layout too -- and its boot
    // script is inlined into the HTML of every statically-rendered page
    // under it, so nothing short of layout-wide invalidation reaches them.
    key === "splash_enabled" ||
    key === "splash_phrase" ||
    key === "splash_hold_seconds" ||
    key === "splash_revisit_minutes"
  ) {
    revalidatePath("/", "layout");
  }

  return NextResponse.json({ success: true });
}
