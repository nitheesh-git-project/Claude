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
]);

// Bounds on the admin-managed /book language list -- not business rules so
// much as guards against a single fat-fingered paste becoming an unusable
// wall of chips on the booking page.
const MAX_BOOKING_LANGUAGES = 25;
const MAX_LANGUAGE_LENGTH = 40;

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
    (key === "session_packages_visible" || key === "google_meet_enabled") &&
    typeof value !== "boolean"
  ) {
    return NextResponse.json({ error: "value must be a boolean" }, { status: 400 });
  }
  if (
    (key === "session_timeout_minutes" ||
      key === "join_window_minutes" ||
      key === "join_window_after_minutes") &&
    (typeof value !== "number" || value < 0)
  ) {
    return NextResponse.json({ error: "value must be a non-negative number" }, { status: 400 });
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

  return NextResponse.json({ success: true });
}
