import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_COLUMNS = new Set(["session_packages_visible", "session_timeout_minutes"]);

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
  if (key === "session_packages_visible" && typeof value !== "boolean") {
    return NextResponse.json({ error: "value must be a boolean" }, { status: 400 });
  }
  if (key === "session_timeout_minutes" && (typeof value !== "number" || value < 0)) {
    return NextResponse.json({ error: "value must be a non-negative number" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("site_settings")
    .update({ [key]: value })
    .eq("id", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
