import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import {
  validateHomeVisitPackagePayload,
  type HomeVisitPackagePayload,
} from "@/lib/validateHomeVisitPackagePayload";

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<
    HomeVisitPackagePayload & { id?: string }
  >(request);
  if (parseError) return parseError;
  const { id, ...payload } = body;

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const validated = validateHomeVisitPackagePayload(payload, { requireTitleAndPricing: true });
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const admin = createAdminClient();

  if (validated.columns.category_id) {
    const { data: category } = await admin
      .from("treatment_categories")
      .select("id")
      .eq("id", validated.columns.category_id)
      .single();
    if (!category) {
      return NextResponse.json({ error: "That category doesn't exist" }, { status: 400 });
    }
  }

  // visit_count is edited in place rather than frozen once sold. A purchase
  // snapshots its own visit_count at checkout (see
  // home_visit_package_purchases), so changing the catalogue figure only
  // affects future sales -- the same reason the online packages let
  // session_count be edited.
  const { error } = await admin
    .from("home_visit_packages")
    .update(validated.columns)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/home-visit");

  return NextResponse.json({ success: true });
}
