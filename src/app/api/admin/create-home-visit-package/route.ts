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

  const { data: body, error: parseError } =
    await parseJsonBody<HomeVisitPackagePayload>(request);
  if (parseError) return parseError;

  const validated = validateHomeVisitPackagePayload(body, { requireTitleAndPricing: true });
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const admin = createAdminClient();

  // category_id is optional here (unlike the online packages, which are
  // defined per category) -- but if one was given it has to be real, or the
  // insert fails on a foreign key with an unreadable message.
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

  const { data, error } = await admin
    .from("home_visit_packages")
    .insert(validated.columns)
    .select("id, package_code")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // /home-visit is ISR-cached, so without this a newly published package
  // would take up to five minutes to appear.
  revalidatePath("/home-visit");

  return NextResponse.json({ success: true, id: data.id, packageCode: data.package_code });
}
