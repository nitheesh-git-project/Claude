import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";

// Mirrors /api/admin/update-lead-status for the b2b_leads pipeline -- same
// shape, same reasoning. The waitlist is demand we had to turn away, and
// working through it is how the next service area gets chosen.
const ALLOWED_STATUSES = new Set(["new", "contacted", "served", "declined"]);

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("catalog");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    id?: string;
    status?: string;
  }>(request);
  if (parseError) return parseError;

  const { id, status } = body;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  if (typeof status !== "string" || !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: "Unknown status" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("home_visit_waitlist")
    .update({ status })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
