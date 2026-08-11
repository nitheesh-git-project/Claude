import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_COLUMNS = new Set([
  "session_packages_visible",
  "session_timeout_minutes",
  "google_meet_enabled",
  "join_window_minutes",
  "join_window_after_minutes",
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
]);

// Bounds on the admin-managed /book language list -- not business rules so
// much as guards against a single fat-fingered paste becoming an unusable
// wall of chips on the booking page.
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
      key === "package_therapist_lock_enabled") &&
    typeof value !== "boolean"
  ) {
    return NextResponse.json({ error: "value must be a boolean" }, { status: 400 });
  }
  if (
    (key === "session_timeout_minutes" ||
      key === "join_window_minutes" ||
      key === "join_window_after_minutes" ||
      key === "package_expiry_reminder_days") &&
    (typeof value !== "number" || value < 0)
  ) {
    return NextResponse.json({ error: "value must be a non-negative number" }, { status: 400 });
  }
  // Unlike the timers above, these two are a divisor and a loop bound
  // downstream (per-session validity math, the bulk scheduler's date
  // limit) -- zero is meaningless for either, so they're held to > 0
  // rather than >= 0, matching the DB check constraints on the matching
  // site_settings columns.
  if (
    (key === "package_default_validity_days" || key === "package_bulk_schedule_max") &&
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

  // /book is ISR-cached (revalidate = 300), so without this an edited
  // language list would take up to five minutes to reach patients. Marks
  // the path stale so the next visitor renders the new list instead.
  if (key === "booking_languages") {
    revalidatePath("/book");
  }

  // Brand & Contact Details render in the Navbar/Footer, which sit in the
  // root layout wrapping every statically-rendered page -- "layout" scope
  // invalidates the whole site's cache under it in one call, rather than
  // guessing which individual routes need a fresh copy.
  if (
    BRAND_TEXT_FIELDS.has(key) ||
    LONG_TEXT_FIELDS.has(key) ||
    CONTACT_FIELDS.has(key) ||
    key === "contact_email"
  ) {
    revalidatePath("/", "layout");
  }

  return NextResponse.json({ success: true });
}
