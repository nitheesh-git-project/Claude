import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";

/**
 * The "Default on booking" switch on Catalog -> Conditions: which service
 * /book and /book-home-visit open on. `{ id }` turns it on for that service
 * (and off for whichever had it); `{ id: null }` turns it off, and booking
 * then opens unanswered.
 *
 * One at a time is the database's rule, not this route's:
 * set_default_treatment_category() clears and sets in one transaction and a
 * partial unique index refuses a second default, so two admins flipping two
 * switches at once end with one default, never two.
 */
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("catalog");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{ id?: unknown }>(request);
  if (parseError) return parseError;
  const { id } = body;
  if (id !== null && (typeof id !== "string" || !id)) {
    return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 });
  }

  const admin = createAdminClient();
  let label = "No default service";
  if (id) {
    const { data: row, error: readError } = await admin
      .from("treatment_categories")
      .select("id, title, active")
      .eq("id", id)
      .maybeSingle();
    if (readError) return serverError("admin/set-default-treatment-category", readError);
    if (!row) return NextResponse.json({ error: "That service no longer exists." }, { status: 404 });
    if (!row.active) {
      return NextResponse.json(
        { error: "Only an active service can be the booking default. Activate it first." },
        { status: 400 }
      );
    }
    label = `Booking default: ${row.title}`;
  }

  const { error } = await admin.rpc("set_default_treatment_category", { p_id: id });
  if (error) {
    if (error.code === "P0002") {
      return NextResponse.json(
        { error: "Only an active service can be the booking default." },
        { status: 400 }
      );
    }
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Another admin changed the default at the same moment. Refresh and try again." },
        { status: 409 }
      );
    }
    return serverError("admin/set-default-treatment-category", error);
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "catalog.update",
    targetId: id,
    targetLabel: label,
  });

  // Both booking pages are what this changes; they are ISR-cached, so
  // without this the old default stays up for another five minutes.
  revalidatePath("/book");
  revalidatePath("/book-home-visit");

  return NextResponse.json({ success: true });
}
